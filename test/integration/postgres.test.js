import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPool, waitForDatabase, runSqlFile, runWithContext } from '@del-campo/shared';
import { startServices } from './harness.js';

/**
 * The 6 microservices against a REAL PostgreSQL (e.g. a Neon branch made for tests, never production).
 * It only runs with TEST_DATABASE_URL (npm run test:db reads it from .env.test); otherwise it is skipped.
 * Every run uses new ids/emails, so it can be repeated on the same database.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const skip = databaseUrl ? false : 'TEST_DATABASE_URL no está definido (ver docs/DESPLIEGUE.md)';
const SCHEMA = fileURLToPath(new URL('../../db/schema.sql', import.meta.url));
const NAMES = ['user', 'pricing', 'reputation', 'catalog', 'cart', 'order'];
const run = Date.now().toString(36);
const as = (userId, role, fn) => runWithContext({ userId, role }, fn);

let services;

before(async () => {
  if (skip) return;
  const pool = createPool(databaseUrl, { max: 1 });
  await waitForDatabase(pool);
  await runSqlFile(pool, SCHEMA);
  await pool.end();
  services = await startServices(NAMES, Object.fromEntries(NAMES.map((name) => [name, { databaseUrl }])));
});

after(async () => {
  await services?.stop();
});

test('PostgreSQL: the whole flow writes and reads each service\'s own tables', { skip }, async () => {
  const { user, catalog, cart, order, reputation, pricing } = services;
  const producer = await user.client.call('Register', { role: 'PRODUCER', name: `Prod ${run}`, email: `prod-${run}@test.co`, password: 'clave123' });
  const buyer = await user.client.call('Register', { role: 'BUYER', name: `Buyer ${run}`, email: `buyer-${run}@test.co`, password: 'clave123' });
  const p = producer.user.id;
  const b = buyer.user.id;

  const listing = await as(p, 'PRODUCER', () => catalog.client.call('PublishListing', { product: `Haba ${run}`, price: 3000, quantity: 20 }));
  await as(p, 'PRODUCER', () => catalog.client.call('EditListing', { id: listing.id, price: 3200 }));
  await as(b, 'BUYER', () => cart.client.call('AddItem', { listingId: listing.id, quantity: 5 }));
  const { orders } = await as(b, 'BUYER', () => order.client.call('CheckoutCart'));
  assert.equal(orders[0].unitPrice, 3200);

  await as(p, 'PRODUCER', () => order.client.call('ChangeOrderStatus', { id: orders[0].id, status: 'CONFIRMED' }));
  await as(p, 'PRODUCER', () => order.client.call('ChangeOrderStatus', { id: orders[0].id, status: 'DELIVERED' }));
  await as(b, 'BUYER', () => reputation.client.call('Rate', { orderId: orders[0].id, scores: { quality: 5, reliability: 5 } }));
  assert.equal((await reputation.client.call('GetReputation', { userId: p })).total, 1);

  const { harvests: [stored] } = await catalog.client.call('GetHarvestsByIds', { ids: [listing.id] });
  assert.equal(stored.reservedQuantity, 5);
  assert.equal(stored.fieldTimestamps.unitPrice != null, true); // JSONB round trip

  const sync = await as(p, 'PRODUCER', () => catalog.client.call('ApplySyncBatch', {
    deviceId: 'pg-test', operationsIsList: true,
    operations: [{ opId: `op-${run}-${randomUUID()}`, type: 'CREATE_HARVEST', entityId: randomUUID(), timestamp: new Date().toISOString(),
      data: { product: 'Mora', estimatedQuantity: 10, unitPrice: 6000, availableOn: '2026-12-01' } }],
  }));
  assert.equal(sync.results[0].status, 'APPLIED');

  assert.ok((await pricing.client.call('GetReference', { product: 'arveja' })).marketPrice > 0);
  const session = await user.client.call('Login', { email: `buyer-${run}@test.co`, password: 'clave123', role: 'BUYER' });
  assert.equal(session.user.id, b);
});

test('PostgreSQL: optimistic concurrency detects a stale write (version)', { skip }, async () => {
  const { catalog } = services;
  const { container } = catalog;
  const listing = await as('p-rosa', 'PRODUCER', () => catalog.client.call('PublishListing', { product: `Lulo ${run}`, price: 4000, quantity: 10 }));
  const stale = await container.harvestRepo.get(listing.id);
  await catalog.client.call('ReserveHarvest', { harvestId: listing.id, quantity: 1 });
  stale.reserve(1);
  await assert.rejects(container.harvestRepo.save(stale, { expectedVersion: stale.version - 1 }), (error) => error.name === 'VersionConflict');
});
