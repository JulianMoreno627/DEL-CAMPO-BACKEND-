import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { GrpcServer, GrpcClient, runWithContext } from '@del-campo/shared';
import { createContainer } from '../src/container.js';
import { registerCartGrpcApi } from '../src/CartGrpcApi.js';
import { FakeCatalogClient } from './fixtures.js';

let server;
let client;
const asAna = (fn) => runWithContext({ userId: 'c-ana', role: 'BUYER' }, fn);

before(async () => {
  const { controller } = await createContainer({ catalogClient: new FakeCatalogClient() });
  server = new GrpcServer({ name: 'cart' });
  registerCartGrpcApi(server, controller);
  client = new GrpcClient('cart', { address: `127.0.0.1:${await server.start(0)}` });
});

after(async () => {
  client.close();
  await server.stop();
});

test('CartGrpcApi: the buyer comes from the metadata and the view travels as CartView', async () => {
  const view = await asAna(() => client.call('AddItem', { listingId: 'cos-3', quantity: 2 }));
  assert.equal(view.total, 2600);
  const [line] = view.items;
  assert.equal(line.found, true);
  assert.equal(line.photo, '/uploads/l.webp');
  assert.equal(line.available, true);

  // Another buyer has another cart
  const other = await runWithContext({ userId: 'c-tienda' }, () => client.call('GetCart'));
  assert.deepEqual(other.items, []);
});

test('CartGrpcApi: quantity not sent is not "0" (it does not remove the product), errors keep their status', async () => {
  await asAna(() => client.call('AddItem', { listingId: 'cos-2', quantity: 1 }));
  await assert.rejects(asAna(() => client.call('ChangeItemQuantity', { listingId: 'cos-2' })), /La cantidad debe ser positiva/);
  await assert.rejects(asAna(() => client.call('AddItem', { listingId: 'cos-2', quantity: 5000 })), (error) => error.status === 409);

  const { items } = await client.call('GetCartItems', { buyerId: 'c-ana' });
  assert.deepEqual(items.map(({ listingId, quantity }) => ({ listingId, quantity })),
    [{ listingId: 'cos-3', quantity: 2 }, { listingId: 'cos-2', quantity: 1 }]);
  await client.call('EmptyCart', { buyerId: 'c-ana' });
  assert.deepEqual((await asAna(() => client.call('GetCart'))).items, []);
});
