import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createContainer } from '../src/container.js';
import { createApp } from '../src/app.js';
import { DEMO_PASSWORD } from '../src/data/seed.js';

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
