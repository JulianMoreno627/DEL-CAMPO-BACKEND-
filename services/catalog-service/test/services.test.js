import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { VersionConflict } from '@del-campo/shared';
import { EventBus } from '../src/model/EventBus.js';
import { createTestContainer } from './fixtures.js';

test('offline sync: creates, is idempotent and reports conflicts', async () => {
  const c = await createTestContainer();
  const create = { opId: 'op-1', type: 'CREATE_HARVEST', entityId: 'new-1', timestamp: new Date().toISOString(),
    data: { product: 'Haba', estimatedQuantity: 50, unitPrice: 3000, availableOn: '2026-12-01' } };

  const r1 = await c.syncService.applyBatch({ deviceId: 'phone-A', producerId: 'p-rosa', operations: [create] });
  assert.equal(r1.results[0].status, 'APPLIED');

  const r2 = await c.syncService.applyBatch({ deviceId: 'phone-A', producerId: 'p-rosa', operations: [create] });
  assert.equal(r2.results[0].repeated, true);
  assert.equal((await c.harvestRepo.list((h) => h.product === 'Haba')).length, 1);

  // Device B changes the price "now"; A syncs a price change made an hour ago
  await c.harvestService.update('new-1', { unitPrice: 3500 }, { producerId: 'p-rosa' });
  const anHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const r3 = await c.syncService.applyBatch({ deviceId: 'phone-A', producerId: 'p-rosa', operations: [
    { opId: 'op-2', type: 'UPDATE_HARVEST', entityId: 'new-1', timestamp: anHourAgo, data: { unitPrice: 2000, description: 'Haba verde' } },
  ] });
  assert.equal(r3.results[0].status, 'PARTIAL');
  assert.deepEqual(r3.results[0].conflicts, ['unitPrice']);
  assert.equal(r3.results[0].entity.unitPrice, 3500);
  assert.equal(r3.results[0].entity.description, 'Haba verde');
});

test('sync rejects edits to someone else\'s harvest without breaking the batch', async () => {
  const c = await createTestContainer();
  const { results } = await c.syncService.applyBatch({ producerId: 'p-jose', operations: [
    { opId: 'x1', type: 'UPDATE_HARVEST', entityId: 'cos-1', timestamp: new Date().toISOString(), data: { unitPrice: 1 } },
  ] });
  assert.equal(results[0].status, 'REJECTED');
});

test('proximity catalog sorts by distance and filters by radius', async () => {
  const c = await createTestContainer();
  const items = await c.catalogService.catalog({ lat: 4.6486, lng: -74.0628, radiusKm: 40 });
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => i.distanceKm <= 40));
  assert.ok(items.every((i, k) => k === 0 || items[k - 1].distanceKm <= i.distanceKm));
});

test('the producer publishes a listing and the buyer sees it with the price only', async () => {
  const c = await createTestContainer();
  const listing = await c.listingService.publish('p-rosa', {
    product: 'Cubios', description: 'Cubios de páramo', price: 3500, quantity: 40,
  });
  assert.equal(listing.price, 3500);
  assert.equal(listing.availableQuantity, 40);
  assert.equal(listing.producer.name, 'Rosa Pérez');

  const list = await c.listingService.list();
  const seen = list.find((l) => l.id === listing.id);
  assert.equal(seen.price, 3500);
  assert.equal('evaluation' in seen, false); // no market price analysis
  assert.ok(list.every((l, k) => k === 0 || list[k - 1].publishedAt >= l.publishedAt)); // newest first
  assert.deepEqual((await c.listingService.list({ search: 'cubio' })).map((l) => l.id), [listing.id]);

  await assert.rejects(c.listingService.publish('c-ana', { product: 'X', price: 1, quantity: 1 }), /Solo un productor/);
  await assert.rejects(c.listingService.edit(listing.id, 'p-jose', { price: 1 }), /dueño/);
  assert.equal((await c.listingService.edit(listing.id, 'p-rosa', { price: 3800 })).price, 3800);
});

test('a listing with orders (even cancelled ones) cannot be deleted: order-service is asked', async () => {
  const c = await createTestContainer();
  const listing = await c.listingService.publish('p-rosa', { product: 'Haba', price: 3000, quantity: 20 });
  c.orderClient.harvestsWithOrders.add(listing.id);
  await assert.rejects(c.listingService.remove(listing.id, 'p-rosa'), (error) => error.status === 409);
  await assert.rejects(c.listingService.remove(listing.id, 'p-jose'), (error) => error.status === 403);

  c.orderClient.harvestsWithOrders.clear();
  const changes = [];
  c.bus.on(EventBus.HARVEST_CHANGED, (h) => changes.push(h.id));
  await c.listingService.remove(listing.id, 'p-rosa');
  assert.deepEqual(changes, [listing.id]);
  assert.equal(await c.harvestRepo.get(listing.id), null);
});

test('reservations: concurrent writes are detected and release puts the harvest back on sale', async () => {
  const c = await createTestContainer();
  const sold = await c.harvestService.reserve('cos-6', 350);
  assert.equal(sold.status, 'SOLD_OUT');
  await assert.rejects(c.harvestService.reserve('cos-6', 1), (error) => error.status === 409);
  const back = await c.harvestService.release('cos-6', 50);
  assert.equal(back.status, 'AVAILABLE');
  assert.equal(back.freeQuantity, 50);

  // Simulates another buyer writing between the read and the write
  const stale = await c.harvestRepo.get('cos-2');
  await c.harvestService.reserve('cos-2', 1);
  stale.reserve(1);
  await assert.rejects(c.harvestRepo.save(stale, { expectedVersion: 1 }), VersionConflict);
});

test('photos: invalid images are rejected first, the owner is checked before writing the file', async () => {
  const photosDir = await mkdtemp(path.join(tmpdir(), 'delcampo-photos-'));
  try {
    const c = await createTestContainer({ photosDir });
    const png = { content: Buffer.from([0x89, 0x50, 0x4e, 0x47]), contentType: 'image/png' };
    await assert.rejects(c.listingService.uploadPhoto('cos-1', 'p-rosa', { content: Buffer.alloc(0), contentType: 'image/png' }), /Envíe una imagen/);
    await assert.rejects(c.listingService.uploadPhoto('cos-1', 'p-rosa', { content: png.content, contentType: 'text/plain' }), /Envíe una imagen/);
    await assert.rejects(c.listingService.uploadPhoto('cos-1', 'p-jose', png), (error) => error.status === 403);
    assert.deepEqual(await readdir(photosDir), []); // nothing written for the foreign producer

    const listing = await c.listingService.uploadPhoto('cos-1', 'p-rosa', png);
    assert.match(listing.photo, /^\/uploads\/[\w-]+\.png$/);
    assert.equal((await readdir(photosDir)).length, 1);
  } finally {
    await rm(photosDir, { recursive: true, force: true });
  }
});

test('season groups the catalog by availability month', async () => {
  const c = await createTestContainer();
  const months = await c.catalogService.season();
  assert.ok(months.length >= 2);
  assert.ok(months.every(({ month, harvests }) => harvests.every((h) => h.harvest.availableOn.startsWith(month))));
});
