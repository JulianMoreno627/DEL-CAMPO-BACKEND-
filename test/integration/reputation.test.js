import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { runWithContext } from '@del-campo/shared';
import { startServices } from './harness.js';
import { demoHarvests } from '../../services/catalog-service/test/fixtures.js';

/** order → delivery → both parties rate each other: reputation validates the order with order-service over gRPC. */
let services;
const as = (userId, fn) => runWithContext({ userId }, fn);

before(async () => {
  services = await startServices(['user', 'pricing', 'reputation', 'catalog', 'order'], { catalog: { harvests: demoHarvests() } });
});

after(async () => {
  await services.stop();
});

test('order → delivery → both parties rate each other (over gRPC)', async () => {
  const { order, reputation, catalog } = services;
  const placed = await as('c-ana', () => order.client.call('CreateOrder', { harvestId: 'cos-2', quantity: 20 }));
  const { harvests: [arveja] } = await catalog.client.call('GetHarvestsByIds', { ids: ['cos-2'] });
  assert.equal(arveja.reservedQuantity, 20);

  await assert.rejects(as('c-ana', () => reputation.client.call('Rate', { orderId: placed.id, scores: { quality: 5, reliability: 5 } })), /entregada/);
  await assert.rejects(as('c-ana', () => order.client.call('ChangeOrderStatus', { id: placed.id, status: 'CONFIRMED' })), /Solo el productor/);
  await as('p-rosa', () => order.client.call('ChangeOrderStatus', { id: placed.id, status: 'CONFIRMED' }));
  await as('p-rosa', () => order.client.call('ChangeOrderStatus', { id: placed.id, status: 'DELIVERED' }));

  await as('c-ana', () => reputation.client.call('Rate', { orderId: placed.id, scores: { quality: 5, reliability: 4 } }));
  await as('p-rosa', () => reputation.client.call('Rate', { orderId: placed.id, scores: { paysOnTime: 5, seriousness: 5 } }));
  await assert.rejects(as('p-rosa', () => reputation.client.call('Rate', { orderId: placed.id, scores: { paysOnTime: 1, seriousness: 1 } })), /Ya calificó/);
  assert.equal((await reputation.client.call('GetReputation', { userId: 'c-ana' })).total, 1);
});

test('producer profile combines user, catalog, pricing and reputation (over gRPC)', async () => {
  const profile = await services.catalog.client.call('GetProducerProfile', { producerId: 'p-rosa' });
  assert.equal(profile.producer.farm, 'La Esperanza');
  assert.equal(profile.harvests.length, 2);
  assert.ok(profile.harvests.every((h) => ['LOW', 'FAIR', 'HIGH', 'NO_REFERENCE'].includes(h.priceEvaluation)));
  assert.equal(profile.reputation.total, 1); // the rating of the previous test
  await assert.rejects(services.catalog.client.call('GetProducerProfile', { producerId: 'nobody' }),
    (error) => error.status === 404 && error.message === 'Usuario no encontrado');
});
