import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createContainer } from '../src/container.js';
import { createApp } from '../src/app.js';
import { DEMO_PASSWORD } from '../src/data/seed.js';

test('sign-up and login with a producer or buyer profile', async () => {
  const c = await createContainer({ withDemoData: true });
  const { token, user } = await c.authService.register({
    role: 'PRODUCER', name: 'Marta Díaz', email: 'Marta@Correo.co', password: 'secreta1', town: 'Tibasosa',
  });
  assert.equal(user.role, 'PRODUCER');
  assert.equal(c.authService.verifyToken(token).sub, user.id);
  assert.equal(JSON.stringify(user).includes('secreta1'), false);

  const session = await c.authService.login({ email: 'marta@correo.co', password: 'secreta1', role: 'PRODUCER' });
  assert.equal(session.user.id, user.id);

  await assert.rejects(c.authService.login({ email: 'marta@correo.co', password: 'otra-clave' }), /incorrectos/);
  await assert.rejects(c.authService.login({ email: 'marta@correo.co', password: 'secreta1', role: 'BUYER' }), /ingrese como productor/);
  await assert.rejects(c.authService.register({ role: 'BUYER', name: 'Otra', email: 'marta@correo.co', password: 'secreta1' }), /Ya existe/);
  await assert.rejects(c.authService.register({ name: 'Sin rol', email: 'x@y.co', password: 'secreta1' }), /productor o comprador/);
  await assert.rejects(c.authService.register({ role: 'BUYER', name: 'Corta', email: 'z@y.co', password: '123' }), /al menos 6/);
});

test('a tampered token or one signed by another server is not valid', async () => {
  const c = await createContainer({ withDemoData: true });
  const { token } = await c.authService.login({ email: 'ana@delcampo.co', password: DEMO_PASSWORD });
  const [body, signature] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'p-rosa', role: 'PRODUCER', exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal(c.authService.verifyToken(`${forged}.${signature}`), null);
  assert.equal(c.authService.verifyToken(`${body}.x`), null);
  assert.equal(c.authService.verifyToken('garbage'), null);

  const other = await createContainer({ withDemoData: true }); // another server with another secret
  assert.equal(other.authService.verifyToken(token), null);
});

test('the producer publishes a listing and the buyer sees it with the price only', async () => {
  const c = await createContainer({ withDemoData: true });
  const listing = await c.listingService.publish('p-rosa', {
    product: 'Cubios', description: 'Cubios de páramo', price: 3500, quantity: 40,
  });
  assert.equal(listing.price, 3500);
  assert.equal(listing.availableQuantity, 40);
  assert.equal(listing.producer.name, 'Rosa Pérez');

  const list = await c.listingService.list();
  const seen = list.find((l) => l.id === listing.id);
  assert.equal(seen.price, 3500);
  assert.equal('evaluation' in seen, false); // no market price analysis
  assert.ok(list.every((l, k) => k === 0 || list[k - 1].publishedAt >= l.publishedAt)); // newest first
  assert.deepEqual((await c.listingService.list({ search: 'cubio' })).map((l) => l.id), [listing.id]);

  await assert.rejects(c.listingService.publish('c-ana', { product: 'X', price: 1, quantity: 1 }), /Solo un productor/);
  await assert.rejects(c.listingService.edit(listing.id, 'p-jose', { price: 1 }), /dueño/);
  assert.equal((await c.listingService.edit(listing.id, 'p-rosa', { price: 3800 })).price, 3800);
});

test('cart: adds, checks stock, checks out and creates orders with the listing price', async () => {
  const c = await createContainer({ withDemoData: true });
  await c.cartService.add('c-ana', 'cos-2', 10); // Arveja 4200/kg
  let cart = await c.cartService.add('c-ana', 'cos-2', 5);
  assert.equal(cart.items[0].quantity, 15);
  cart = await c.cartService.add('c-ana', 'cos-3', 2); // Lechuga 1300
  assert.equal(cart.total, 15 * 4200 + 2 * 1300);

  await assert.rejects(c.cartService.add('c-ana', 'cos-2', 1000), /Solo quedan/);
  await c.cartService.changeQuantity('c-ana', 'cos-3', 0);
  assert.equal((await c.cartService.view('c-ana')).items.length, 1);

  const { orders, total } = await c.cartService.checkout('c-ana');
  assert.equal(orders.length, 1);
  assert.equal(total, 15 * 4200);
  assert.equal(orders[0].producerId, 'p-rosa');
  assert.equal((await c.harvestRepo.get('cos-2')).reservedQuantity, 15);
  assert.equal((await c.cartService.view('c-ana')).items.length, 0);
  await assert.rejects(c.cartService.checkout('c-ana'), /vacío/);
});

test('cart: if a product no longer has enough quantity, the whole checkout is rolled back', async () => {
  const c = await createContainer({ withDemoData: true });
  await c.cartService.add('c-ana', 'cos-6', 350); // all the tree tomato
  await c.cartService.add('c-ana', 'cos-3', 10);
  await c.orderService.create({ harvestId: 'cos-3', buyerId: 'c-tienda', quantity: 495 }); // another buyer gets there first

  await assert.rejects(c.cartService.checkout('c-ana'), /Solo quedan 5/);
  const tomato = await c.harvestRepo.get('cos-6');
  assert.equal(tomato.reservedQuantity, 0);
  assert.equal(tomato.status, 'AVAILABLE'); // back on sale after the rollback
  assert.equal((await c.orderService.list({ buyerId: 'c-ana' })).length, 0);
  assert.equal((await c.cartService.view('c-ana')).items.length, 2);
});

test('HTTP: login per profile, producer listing and checkout from the cart', async () => {
  const c = await createContainer({ withDemoData: true });
  const server = createApp(c).listen(0);
  const base = `http://localhost:${server.address().port}/api`;
  const call = async (method, route, { token, body } = {}) => {
    const response = await fetch(base + route, {
      method,
      headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  };
  try {
    const wrongRole = await call('POST', '/auth/login', { body: { email: 'rosa@delcampo.co', password: DEMO_PASSWORD, role: 'BUYER' } });
    assert.equal(wrongRole.status, 403);

    const producer = (await call('POST', '/auth/login', { body: { email: 'rosa@delcampo.co', password: DEMO_PASSWORD, role: 'PRODUCER' } })).data;
    const buyer = (await call('POST', '/auth/register', { body: { role: 'BUYER', name: 'Pedro', email: 'pedro@correo.co', password: 'clave123' } })).data;

    assert.equal((await call('POST', '/listings', { body: { product: 'Haba', price: 3000, quantity: 20 } })).status, 401);
    assert.equal((await call('POST', '/listings', { token: buyer.token, body: { product: 'Haba', price: 3000, quantity: 20 } })).status, 403);
    const { status, data: listing } = await call('POST', '/listings', { token: producer.token, body: { product: 'Haba', description: 'Haba verde', price: 3000, quantity: 20 } });
    assert.equal(status, 201);

    const { data: list } = await call('GET', '/listings');
    assert.ok(list.some((l) => l.id === listing.id && l.price === 3000));

    assert.equal((await call('GET', '/cart', { token: producer.token })).status, 403);
    await call('POST', '/cart/items', { token: buyer.token, body: { listingId: listing.id, quantity: 4 } });
    const checkout = await call('POST', '/cart/checkout', { token: buyer.token });
    assert.equal(checkout.status, 201);
    assert.equal(checkout.data.total, 12000);

    const { data: mine } = await call('GET', '/listings/mine', { token: producer.token });
    assert.equal(mine.find((l) => l.id === listing.id).soldQuantity, 4);
    assert.equal((await call('DELETE', `/listings/${listing.id}`, { token: producer.token })).status, 409); // it already has orders

    const { data: orders } = await call('GET', '/orders', { token: producer.token });
    assert.ok(orders.some((o) => o.buyerName === 'Pedro' && o.quantity === 4));
  } finally {
    server.close();
  }
});

test('persistence: accounts, products and sessions survive a restart; no default products', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'delcampo-'));
  const dataPath = path.join(folder, 'db.json');
  try {
    const before = await createContainer({ dataPath });
    assert.equal((await before.listingService.list()).length, 0); // only what producers publish
    const { token, user } = await before.authService.register({ role: 'PRODUCER', name: 'Marta', email: 'marta@correo.co', password: 'secreta1' });
    const listing = await before.listingService.publish(user.id, { product: 'Cubios', price: 3500, quantity: 10 });
    await before.listingService.edit(listing.id, user.id, { product: 'Cubios rojos' });
    await before.persistence.save();

    const after = await createContainer({ dataPath }); // "server restart"
    assert.deepEqual((await after.listingService.list()).map((l) => l.product), ['Cubios rojos']);
    assert.equal((await after.authService.login({ email: 'marta@correo.co', password: 'secreta1' })).user.id, user.id);
    assert.equal(after.authService.verifyToken(token)?.sub, user.id); // the session is still valid
    assert.equal((await after.userRepo.list()).length, (await before.userRepo.list()).length); // the seed is not duplicated
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
