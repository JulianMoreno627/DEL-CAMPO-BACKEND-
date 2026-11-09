import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cart } from '../src/model/Cart.js';
import { createContainer } from '../src/container.js';
import { FakeCatalogClient } from './fixtures.js';

const newCart = async () => {
  const catalog = new FakeCatalogClient();
  return { ...(await createContainer({ catalogClient: catalog })), catalog };
};

test('Cart: positive quantities and quantity 0 removes the product', () => {
  const cart = new Cart({ buyerId: 'c-ana' });
  cart.add('a1', 2);
  assert.equal(cart.id, 'c-ana');
  assert.throws(() => cart.add('a1', -1), /positiva/);
  cart.changeQuantity('a1', 0);
  assert.equal(cart.isEmpty, true);
});

test('cart: adds, accumulates, checks stock and shows the current price', async () => {
  const { cartService } = await newCart();
  await cartService.add('c-ana', 'cos-2', 10);
  let cart = await cartService.add('c-ana', 'cos-2', 5);
  assert.equal(cart.items[0].quantity, 15);
  cart = await cartService.add('c-ana', 'cos-3', 2);
  assert.equal(cart.total, 15 * 4200 + 2 * 1300);
  assert.equal(cart.items[1].photo, '/uploads/l.webp');

  await assert.rejects(cartService.add('c-ana', 'cos-2', 1000), /Solo quedan 300 kg de Arveja/);
  await assert.rejects(cartService.add('c-ana', 'cos-9', 1), (error) => error.status === 409 && /ya no está disponible/.test(error.message));
  await assert.rejects(cartService.add('c-ana', 'nope', 1), /Cosecha no encontrado/);
  await cartService.changeQuantity('c-ana', 'cos-3', 0);
  assert.equal((await cartService.view('c-ana')).items.length, 1);
});

test('cart: a listing that disappeared is shown as not available, and the saga operations work', async () => {
  const { cartService, catalog } = await newCart();
  await cartService.add('c-ana', 'cos-3', 3);
  catalog.harvests.delete('cos-3');
  const { items, total } = await cartService.view('c-ana');
  assert.deepEqual(items, [{ listingId: 'cos-3', quantity: 3, product: null, available: false, subtotal: 0 }]);
  assert.equal(total, 0);

  assert.deepEqual(await cartService.items('c-ana'), [{ listingId: 'cos-3', quantity: 3 }]);
  await cartService.empty('c-ana');
  assert.deepEqual(await cartService.items('c-ana'), []);
});
