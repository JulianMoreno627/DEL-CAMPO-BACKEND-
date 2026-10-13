import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';
import { createApp } from '../src/app.js';

test('offline sync: creates, is idempotent and reports conflicts', async () => {
  const c = await createContainer({ withDemoData: true });
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
  const c = await createContainer({ withDemoData: true });
  const { results } = await c.syncService.applyBatch({ producerId: 'p-jose', operations: [
    { opId: 'x1', type: 'UPDATE_HARVEST', entityId: 'cos-1', timestamp: new Date().toISOString(), data: { unitPrice: 1 } },
  ] });
  assert.equal(results[0].status, 'REJECTED');
});

test('order → delivery → both parties rate each other', async () => {
  const c = await createContainer({ withDemoData: true });
  const order = await c.orderService.create({ harvestId: 'cos-2', buyerId: 'c-ana', quantity: 20 });
  assert.equal((await c.harvestRepo.get('cos-2')).reservedQuantity, 20);

  await assert.rejects(c.reputationService.rate({ orderId: order.id, fromUserId: 'c-ana', scores: { quality: 5, reliability: 5 } }), /entregada/);
  await assert.rejects(c.orderService.changeStatus(order.id, 'CONFIRMED', 'c-ana'), /Solo el productor/);
  await c.orderService.changeStatus(order.id, 'CONFIRMED', 'p-rosa');
  await c.orderService.changeStatus(order.id, 'DELIVERED', 'p-rosa');

  await c.reputationService.rate({ orderId: order.id, fromUserId: 'c-ana', scores: { quality: 5, reliability: 4 } });
  await c.reputationService.rate({ orderId: order.id, fromUserId: 'p-rosa', scores: { paysOnTime: 5, seriousness: 5 } });
  await assert.rejects(c.reputationService.rate({ orderId: order.id, fromUserId: 'p-rosa', scores: { paysOnTime: 1, seriousness: 1 } }), /Ya calificó/);
  assert.equal((await c.reputationService.reputationOf('c-ana')).total, 2);
});

test('cancelling an order gives the quantity back to the harvest', async () => {
  const c = await createContainer({ withDemoData: true });
  const order = await c.orderService.create({ harvestId: 'cos-1', buyerId: 'c-tienda', quantity: 100 });
  await c.orderService.changeStatus(order.id, 'CANCELLED', 'c-tienda');
  assert.equal((await c.harvestRepo.get('cos-1')).reservedQuantity, 0);
});

test('proximity catalog sorts by distance and filters by radius', async () => {
  const c = await createContainer({ withDemoData: true });
  const items = await c.catalogService.catalog({ lat: 4.6486, lng: -74.0628, radiusKm: 40 });
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => i.distanceKm <= 40));
  assert.ok(items.every((i, k) => k === 0 || items[k - 1].distanceKm <= i.distanceKm));
});

test('HTTP: SSR with ISR cache (MISS → HIT → invalidation) and Server-Timing', async () => {
  const c = await createContainer({ withDemoData: true });
  const server = createApp(c).listen(0);
  const base = `http://localhost:${server.address().port}`;
  try {
    const r1 = await fetch(`${base}/productores/p-rosa`);
    assert.equal(r1.headers.get('x-cache-isr'), 'MISS');
    assert.match(await r1.text(), /La Esperanza/);
    assert.match(r1.headers.get('server-timing'), /app;dur=/);

    const r2 = await fetch(`${base}/productores/p-rosa`);
    assert.equal(r2.headers.get('x-cache-isr'), 'HIT');

    await c.harvestService.update('cos-1', { unitPrice: 2700 }, { producerId: 'p-rosa' });
    const r3 = await fetch(`${base}/productores/p-rosa`);
    assert.equal(r3.headers.get('x-cache-isr'), 'MISS');

    const api = await fetch(`${base}/api/catalog`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(api.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  } finally {
    server.close();
  }
});
