import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { GrpcServer, GrpcClient } from '@del-campo/shared';
import { createContainer } from '../src/container.js';
import { registerPricingGrpcApi } from '../src/PricingGrpcApi.js';

let server;
let client;

before(async () => {
  const { controller } = await createContainer();
  server = new GrpcServer({ name: 'pricing' });
  registerPricingGrpcApi(server, controller);
  client = new GrpcClient('pricing', { address: `127.0.0.1:${await server.start(0)}` });
});

after(async () => {
  client.close();
  await server.stop();
});

test('PricingGrpcApi: GetReference returns the message and NOT_FOUND keeps its 404', async () => {
  const reference = await client.call('GetReference', { product: 'Arveja' });
  assert.deepEqual(
    { product: reference.product, marketPrice: reference.marketPrice, fairRange: reference.fairRange },
    { product: 'Arveja', marketPrice: 6500, fairRange: { min: 3900, max: 5525 } });
  await assert.rejects(client.call('GetReference', { product: 'Yuca' }), (error) => error.status === 404);
});

test('PricingGrpcApi: EvaluatePrices answers in the same order, with no reference when there is none', async () => {
  const { items } = await client.call('EvaluatePrices', { items: [
    { product: 'Fresa', price: 20000 },
    { product: 'Yuca', price: 1000 },
  ] });
  assert.equal(items[0].evaluation, 'HIGH');
  assert.equal(items[0].reference.unit, 'kg');
  assert.equal(items[1].evaluation, 'NO_REFERENCE');
  assert.equal(items[1].reference, null);
});
