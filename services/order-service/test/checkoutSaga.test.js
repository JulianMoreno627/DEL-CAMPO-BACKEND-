import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceUnavailable } from '@del-campo/shared';
import { createTestContainer } from './fixtures.js';

test('checkout saga: success creates one order per product with the frozen price and empties the cart', async () => {
  const c = await createTestContainer();
  c.cart.carts.set('c-ana', [{ listingId: 'cos-2', quantity: 15 }, { listingId: 'cos-3', quantity: 2 }]);

  const { orders, total } = await c.checkoutSaga.run('c-ana');
  assert.equal(orders.length, 2);
  assert.equal(total, 15 * 4200 + 2 * 1300);
  assert.deepEqual(orders.map((o) => o.producerId), ['p-rosa', 'p-jose']);
  assert.equal(c.catalog.reservedOf('cos-2'), 15);
  assert.deepEqual(await c.cart.items('c-ana'), []);
  assert.equal((await c.orderRepo.list()).length, 2);
});

test('checkout saga: a failure halfway compensates (releases and deletes) and leaves the cart untouched', async () => {
  const c = await createTestContainer();
  c.cart.carts.set('c-ana', [{ listingId: 'cos-6', quantity: 350 }, { listingId: 'cos-3', quantity: 10 }]);
  await c.orderService.create({ harvestId: 'cos-3', buyerId: 'c-tienda', quantity: 495 }); // another buyer gets there first

  await assert.rejects(c.checkoutSaga.run('c-ana'), (error) => error.status === 409 && /Solo quedan 5/.test(error.message));
  assert.equal(c.catalog.reservedOf('cos-6'), 0); // the tomato was released
  assert.deepEqual(c.catalog.releases, [['cos-6', 350]]);
  assert.equal((await c.orderService.list({ buyerId: 'c-ana' })).length, 0);
  assert.equal((await c.cart.items('c-ana')).length, 2);
});

test('checkout saga: if emptying the cart fails, every order is compensated', async () => {
  const c = await createTestContainer();
  c.cart.carts.set('c-ana', [{ listingId: 'cos-2', quantity: 5 }, { listingId: 'cos-3', quantity: 5 }]);
  c.cart.failEmpty = true;

  await assert.rejects(c.checkoutSaga.run('c-ana'), ServiceUnavailable);
  assert.equal(c.catalog.reservedOf('cos-2'), 0);
  assert.equal(c.catalog.reservedOf('cos-3'), 0);
  assert.deepEqual(c.catalog.releases, [['cos-3', 5], ['cos-2', 5]]); // reverse order
  assert.equal((await c.orderRepo.list()).length, 0);
  assert.equal((await c.cart.items('c-ana')).length, 2);
});

test('checkout saga: a failing compensation is retried; if it keeps failing it is logged and the original error is kept', async () => {
  const c = await createTestContainer();
  c.cart.carts.set('c-ana', [{ listingId: 'cos-2', quantity: 5 }, { listingId: 'nope', quantity: 1 }]);
  c.catalog.failReleases = 2; // fails twice, works on the third attempt
  await assert.rejects(c.checkoutSaga.run('c-ana'), /Cosecha no encontrado/);
  assert.equal(c.catalog.reservedOf('cos-2'), 0);
  assert.deepEqual(c.errors, []);

  c.catalog.failReleases = 99; // catalog-service down
  await assert.rejects(c.checkoutSaga.run('c-ana'), /Cosecha no encontrado/);
  assert.equal(c.errors.length, 1);
  assert.match(c.errors[0], /saga compensation failed \(release 5 of cos-2\)/);
});

test('checkout saga: empty cart and non-buyers are rejected before reserving anything', async () => {
  const c = await createTestContainer();
  await assert.rejects(c.checkoutSaga.run('c-ana'), /El carrito está vacío/);
  c.cart.carts.set('p-rosa', [{ listingId: 'cos-2', quantity: 1 }]);
  await assert.rejects(c.checkoutSaga.run('p-rosa'), (error) => error.status === 403);
  assert.equal(c.catalog.reservedOf('cos-2'), 0);
});
