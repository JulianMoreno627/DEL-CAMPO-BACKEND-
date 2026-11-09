import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { SERVICES } from '@del-campo/shared';
import { freePort } from '../src/supervisor/freePort.js';

/**
 * End to end: starts the REAL backend as Render does (node infrastructure/src/server.js), which forks
 * the 6 microservices as child processes, and goes through the whole flow over REST against the gateway.
 */
const SERVER = fileURLToPath(new URL('../src/server.js', import.meta.url));
let backend;
let base;
let uploads;
let output = '';

async function waitForHealth(predicate, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${base}/api/health`);
      const health = await response.json();
      if (predicate(health)) return health;
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) throw new Error(`Backend not healthy in time. Output:\n${output}`);
    await sleep(300);
  }
}

before(async () => {
  uploads = await mkdtemp(path.join(tmpdir(), 'delcampo-e2e-'));
  const env = { ...process.env, PORT: String(await freePort()), TOKEN_SECRET: 'e2e-secret', UPLOADS_DIR: uploads, DATABASE_URL: '' };
  for (const { portEnv } of Object.values(SERVICES)) env[portEnv] = String(await freePort());
  backend = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  backend.stdout.on('data', (chunk) => { output += chunk; });
  backend.stderr.on('data', (chunk) => { output += chunk; });
  base = `http://127.0.0.1:${env.PORT}`;
  await waitForHealth((health) => health.ok);
});

after(async () => {
  if (backend.exitCode === null) {
    backend.kill('SIGTERM');
    await once(backend, 'exit');
  }
  await rm(uploads, { recursive: true, force: true });
});

async function call(method, route, { token, body } = {}) {
  const response = await fetch(base + route, {
    method,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}

test('e2e: /api/health shows the 6 microservices SERVING and their memory', async () => {
  const { data: health } = await call('GET', '/api/health');
  assert.deepEqual(Object.keys(health.services).sort(), ['cart', 'catalog', 'order', 'pricing', 'reputation', 'user']);
  assert.equal(health.database, 'IN_MEMORY');
  assert.ok(health.memory.gatewayRssMb > 0);
  assert.ok(Object.values(health.memory.services).every((s) => s.rssMb > 0));
});

test('e2e: login → publish → cart → checkout → order → delivery → rating, over REST', async () => {
  const producer = await call('POST', '/api/auth/login', { body: { email: 'rosa@delcampo.co', password: 'campo123', role: 'PRODUCER' } });
  assert.equal(producer.status, 200);
  const rosa = producer.data.token;

  const published = await call('POST', '/api/listings', { token: rosa, body: { product: 'Cubios', description: 'De páramo', price: 3500, quantity: 40 } });
  assert.equal(published.status, 201);
  const listingId = published.data.id;

  const buyer = await call('POST', '/api/auth/register', { body: { role: 'BUYER', name: 'Lucía', email: 'lucia@correo.co', password: 'clave123', type: 'RESTAURANT' } });
  assert.equal(buyer.status, 201);
  const lucia = buyer.data.token;

  assert.equal((await call('POST', '/api/cart/items', { token: lucia, body: { listingId, quantity: 10 } })).status, 201);
  const cart = await call('GET', '/api/cart', { token: lucia });
  assert.equal(cart.data.total, 35000);

  const checkout = await call('POST', '/api/cart/checkout', { token: lucia });
  assert.equal(checkout.status, 201);
  const [order] = checkout.data.orders;
  assert.equal(order.unitPrice, 3500);
  assert.equal((await call('GET', '/api/cart', { token: lucia })).data.items.length, 0);

  const received = await call('GET', '/api/orders', { token: rosa });
  assert.ok(received.data.some((o) => o.id === order.id && o.buyerName === 'Lucía' && o.product === 'Cubios'));

  assert.equal((await call('POST', '/api/ratings', { token: lucia, body: { orderId: order.id, scores: { quality: 5, reliability: 5 } } })).status, 409);
  assert.equal((await call('PATCH', `/api/orders/${order.id}`, { token: rosa, body: { status: 'CONFIRMED' } })).data.status, 'CONFIRMED');
  assert.equal((await call('PATCH', `/api/orders/${order.id}`, { token: rosa, body: { status: 'DELIVERED' } })).data.status, 'DELIVERED');

  const rating = await call('POST', '/api/ratings', { token: lucia, body: { orderId: order.id, scores: { quality: 5, reliability: 4 }, comment: 'Excelentes' } });
  assert.equal(rating.status, 201);
  assert.equal(rating.data.toUserId, 'p-rosa');
  const reputation = await call('GET', '/api/users/p-rosa/reputation');
  assert.equal(reputation.data.total, 1);
  assert.equal(reputation.data.recent[0].comment, 'Excelentes');

  const page = await fetch(`${base}/productores/p-rosa`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /1 calificaciones/);
});

test('e2e: if a microservice dies, the supervisor restarts it', async () => {
  const { data: before } = await call('GET', '/api/health');
  const { pid } = before.memory.services.cart;
  process.kill(pid, 'SIGKILL');

  const after = await waitForHealth((health) => health.ok && health.memory.services.cart.pid !== pid, 30_000);
  assert.equal(after.memory.services.cart.restarts, 1);
  assert.equal(after.services.cart, 'SERVING');
  // The cart works again (in-memory data of that service started from zero, as expected)
  const { data: { token } } = await call('POST', '/api/auth/login', { body: { email: 'ana@delcampo.co', password: 'campo123' } });
  assert.equal((await call('GET', '/api/cart', { token })).status, 200);
});
