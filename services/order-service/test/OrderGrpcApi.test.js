import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { GrpcServer, GrpcClient, runWithContext } from '@del-campo/shared';
import { registerOrderGrpcApi } from '../src/OrderGrpcApi.js';
import { createTestContainer } from './fixtures.js';

let server;
let client;
let container;

before(async () => {
  container = await createTestContainer();
  server = new GrpcServer({ name: 'order' });
  registerOrderGrpcApi(server, container.controller);
  client = new GrpcClient('order', { address: `127.0.0.1:${await server.start(0)}` });
});

after(async () => {
  client.close();
  await server.stop();
});

test('OrderGrpcApi: CheckoutCart for the buyer of the metadata returns the orders as messages', async () => {
  container.cart.carts.set('c-ana', [{ listingId: 'cos-2', quantity: 4 }]);
  const { orders, total } = await runWithContext({ userId: 'c-ana', role: 'BUYER' }, () => client.call('CheckoutCart'));
  assert.equal(total, 16800);
  assert.equal(orders[0].status, 'PENDING');
  assert.equal(orders[0].total, 16800);
  assert.equal((await client.call('HasOrdersForHarvest', { harvestId: 'cos-2' })).hasOrders, true);
});

test('OrderGrpcApi: ListOrders depends on the role; detail fields travel as optional', async () => {
  const received = await runWithContext({ userId: 'p-rosa', role: 'PRODUCER' }, () => client.call('ListOrders'));
  assert.equal(received.orders.length, 1);
  const [detail] = received.orders;
  assert.equal(detail.buyerName, 'Ana Torres');
  assert.equal(detail.product, 'Arveja');
  assert.equal(detail.order.buyerId, 'c-ana');

  const placed = await runWithContext({ userId: 'c-tienda', role: 'BUYER' }, () => client.call('ListOrders'));
  assert.deepEqual(placed.orders, []);
});

test('OrderGrpcApi: status changes, GetOrder and errors with their HTTP status', async () => {
  const [{ order }] = (await runWithContext({ userId: 'c-ana', role: 'BUYER' }, () => client.call('ListOrders'))).orders;
  await assert.rejects(runWithContext({ userId: 'c-ana' }, () => client.call('ChangeOrderStatus', { id: order.id, status: 'DELIVERED' })),
    (error) => error.status === 403);
  await assert.rejects(runWithContext({ userId: 'p-rosa' }, () => client.call('ChangeOrderStatus', { id: order.id, status: 'DELIVERED' })),
    (error) => error.status === 422 && error.name === 'InvalidTransition');
  const confirmed = await runWithContext({ userId: 'p-rosa' }, () => client.call('ChangeOrderStatus', { id: order.id, status: 'CONFIRMED' }));
  assert.equal(confirmed.status, 'CONFIRMED');
  assert.equal((await client.call('GetOrder', { id: order.id })).status, 'CONFIRMED');
  await assert.rejects(client.call('GetOrder', { id: 'nope' }), (error) => error.status === 404 && error.message === 'Reserva no encontrado');
});
