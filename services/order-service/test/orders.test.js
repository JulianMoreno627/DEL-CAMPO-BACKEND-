import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InvalidTransition } from '@del-campo/shared';
import { Order } from '../src/model/Order.js';
import { createTestContainer } from './fixtures.js';

test('an order follows its life cycle and computes the total', () => {
  const order = new Order({ harvestId: 'h', producerId: 'p', buyerId: 'b', quantity: 10, unitPrice: 2500 });
  assert.equal(order.total, 25000);
  order.changeStatus('CONFIRMED');
  order.changeStatus('DELIVERED');
  assert.equal(order.completed, true);
  assert.throws(() => order.changeStatus('CANCELLED'), InvalidTransition);
});

test('cancelling an order gives the quantity back to the harvest', async () => {
  const c = await createTestContainer();
  const order = await c.orderService.create({ harvestId: 'cos-2', buyerId: 'c-tienda', quantity: 100 });
  assert.equal(c.catalog.reservedOf('cos-2'), 100);
  await c.orderService.changeStatus(order.id, 'CANCELLED', 'c-tienda');
  assert.equal(c.catalog.reservedOf('cos-2'), 0);
});

test('order rules: only the producer confirms and delivers; only a buyer orders', async () => {
  const c = await createTestContainer();
  const order = await c.orderService.create({ harvestId: 'cos-2', buyerId: 'c-ana', quantity: 20 });
  assert.equal(order.unitPrice, 4200); // price frozen when ordering
  await assert.rejects(c.orderService.changeStatus(order.id, 'CONFIRMED', 'c-ana'), /Solo el productor/);
  await assert.rejects(c.orderService.changeStatus(order.id, 'CONFIRMED', 'p-jose'), /No participa/);
  await c.orderService.changeStatus(order.id, 'CONFIRMED', 'p-rosa');
  assert.equal((await c.orderService.changeStatus(order.id, 'DELIVERED', 'p-rosa')).completed, true);
  await assert.rejects(c.orderService.create({ harvestId: 'cos-2', buyerId: 'p-rosa', quantity: 1 }), /Solo un comprador/);
  assert.equal(await c.orderService.hasOrdersForHarvest('cos-2'), true);
  assert.equal(await c.orderService.hasOrdersForHarvest('cos-3'), false);
});

test('orders are listed with product and names, newest first', async () => {
  const c = await createTestContainer();
  await c.orderService.create({ harvestId: 'cos-2', buyerId: 'c-ana', quantity: 1 });
  await c.orderService.create({ harvestId: 'cos-3', buyerId: 'c-ana', quantity: 2 });
  const list = await c.orderService.list({ buyerId: 'c-ana' });
  assert.deepEqual(list.map((d) => d.product).sort(), ['Arveja', 'Lechuga']);
  assert.ok(list.every((d, k) => k === 0 || list[k - 1].order.updatedAt >= d.order.updatedAt)); // newest first
  const lettuce = list.find((d) => d.product === 'Lechuga');
  assert.equal(lettuce.producerName, 'José Rincón');
  assert.equal(lettuce.buyerName, 'Ana Torres');
  assert.equal(lettuce.unit, 'unidad');
  assert.equal((await c.orderService.list({ producerId: 'p-rosa' })).length, 1);
});
