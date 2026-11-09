import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { runWithContext } from '@del-campo/shared';
import { startServices } from './harness.js';
import { demoHarvests } from '../../services/catalog-service/test/fixtures.js';

/**
 * The cart scenarios of the monolith, now crossing 4 real microservices over gRPC:
 * cart → catalog (stock), order → cart + catalog + user (checkout saga).
 */
let services;
const as = (userId, role, fn) => runWithContext({ userId, role }, fn);
const asAna = (fn) => as('c-ana', 'BUYER', fn);

before(async () => {
  services = await startServices(['user', 'catalog', 'cart', 'order'], { catalog: { harvests: demoHarvests() } });
});

after(async () => {
  await services.stop();
});

test('cart: adds, checks stock, checks out and creates orders with the listing price (over gRPC)', async () => {
  const { cart, order, catalog } = services;
  await asAna(() => cart.client.call('AddItem', { listingId: 'cos-2', quantity: 10 })); // Arveja 4200/kg
  let view = await asAna(() => cart.client.call('AddItem', { listingId: 'cos-2', quantity: 5 }));
  assert.equal(view.items[0].quantity, 15);
  view = await asAna(() => cart.client.call('AddItem', { listingId: 'cos-3', quantity: 2 })); // Lechuga 1300
  assert.equal(view.total, 15 * 4200 + 2 * 1300);

  await assert.rejects(asAna(() => cart.client.call('AddItem', { listingId: 'cos-2', quantity: 1000 })), /Solo quedan/);
  await asAna(() => cart.client.call('ChangeItemQuantity', { listingId: 'cos-3', quantity: 0 }));
  assert.equal((await asAna(() => cart.client.call('GetCart'))).items.length, 1);

  const { orders, total } = await asAna(() => order.client.call('CheckoutCart'));
  assert.equal(orders.length, 1);
  assert.equal(total, 15 * 4200);
  assert.equal(orders[0].producerId, 'p-rosa');
  const { harvests: [arveja] } = await catalog.client.call('GetHarvestsByIds', { ids: ['cos-2'] });
  assert.equal(arveja.reservedQuantity, 15);
  assert.equal((await asAna(() => cart.client.call('GetCart'))).items.length, 0);
  await assert.rejects(asAna(() => order.client.call('CheckoutCart')), /vacío/);
});

test('cart: if a product no longer has enough quantity, the whole checkout is rolled back (saga compensation over gRPC)', async () => {
  const { cart, order, catalog } = services;
  await asAna(() => cart.client.call('AddItem', { listingId: 'cos-6', quantity: 350 })); // all the tree tomato
  await asAna(() => cart.client.call('AddItem', { listingId: 'cos-3', quantity: 10 }));
  // another buyer gets there first
  await as('c-tienda', 'BUYER', () => order.client.call('CreateOrder', { harvestId: 'cos-3', quantity: 495 }));

  await assert.rejects(asAna(() => order.client.call('CheckoutCart')), (error) => error.status === 409 && /Solo quedan 5/.test(error.message));
  const { harvests: [tomato] } = await catalog.client.call('GetHarvestsByIds', { ids: ['cos-6'] });
  assert.equal(tomato.reservedQuantity, 0);
  assert.equal(tomato.status, 'AVAILABLE'); // back on sale after the compensation
  const { orders } = await asAna(() => order.client.call('ListOrders'));
  assert.equal(orders.filter((d) => d.order.harvestId === 'cos-6').length, 0);
  assert.equal((await asAna(() => cart.client.call('GetCart'))).items.length, 2);
});

test('a listing with orders cannot be deleted: catalog asks order-service over gRPC', async () => {
  const { order, catalog } = services;
  const listing = await as('p-luis', 'PRODUCER', () => catalog.client.call('PublishListing', { product: 'Haba', price: 3000, quantity: 20 }));
  const placed = await asAna(() => order.client.call('CreateOrder', { harvestId: listing.id, quantity: 2 }));
  await asAna(() => order.client.call('ChangeOrderStatus', { id: placed.id, status: 'CANCELLED' }));
  // Cancelled: no quantity is reserved any more, but the order exists as history
  await assert.rejects(as('p-luis', 'PRODUCER', () => catalog.client.call('DeleteListing', { id: listing.id })),
    (error) => error.status === 409 && /ya tiene pedidos/.test(error.message));
});
