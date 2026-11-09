import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionToken } from '@del-campo/shared';
import { startServices } from '../../test/integration/harness.js';
import { demoHarvests } from '../../services/catalog-service/test/fixtures.js';
import { createGateway } from '../src/gateway/app.js';
import { createGrpcClients } from '../src/clients.js';
import { IsrCache } from '../src/render/IsrCache.js';
import { HarvestChangeSubscriber } from '../src/render/HarvestChangeSubscriber.js';
import { MetricsService } from '../src/metrics/MetricsService.js';
import { PUBLIC_DIR } from '../src/config.js';

/**
 * REST API Gateway in front of the 6 real microservices (in this process, talking over gRPC).
 * The same HTTP scenarios the monolith had, plus the error format and the photo upload.
 */
let services;
let clients;
let subscriber;
let server;
let base;
let photosDir;

before(async () => {
  photosDir = await mkdtemp(path.join(tmpdir(), 'delcampo-gateway-'));
  services = await startServices(['user', 'pricing', 'reputation', 'catalog', 'cart', 'order'], {
    catalog: { harvests: demoHarvests(), photosDir },
  });
  clients = createGrpcClients();
  const isrCache = new IsrCache({ revalidateSeconds: 60 });
  subscriber = new HarvestChangeSubscriber({ catalog: clients.catalog, isrCache }).start();
  const app = createGateway({
    clients,
    sessionToken: new SessionToken('integration-secret'),
    isrCache,
    metricsService: new MetricsService(),
    frontendUrl: 'http://localhost:5173',
    allowedOrigins: ['http://localhost:5173'],
    uploadsDir: photosDir,
    publicDir: PUBLIC_DIR,
    healthProbe: async () => ({ services: { catalog: 'SERVING' }, database: 'IN_MEMORY' }),
  });
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  server.close();
  subscriber.stop();
  clients.close();
  await services.stop();
  await rm(photosDir, { recursive: true, force: true });
});

async function call(method, route, { token, body, headers = {} } = {}) {
  const response = await fetch(base + route, {
    method,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }), ...headers },
    body: body && JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, data: text ? JSON.parse(text) : null };
}

test('HTTP: login per profile, producer listing and checkout from the cart', async () => {
  const wrongRole = await call('POST', '/api/auth/login', { body: { email: 'rosa@delcampo.co', password: 'campo123', role: 'BUYER' } });
  assert.equal(wrongRole.status, 403);
  assert.deepEqual(wrongRole.data, { error: 'Esta cuenta es de productor: ingrese como productor', type: 'DomainError' });

  const producer = (await call('POST', '/api/auth/login', { body: { email: 'rosa@delcampo.co', password: 'campo123', role: 'PRODUCER' } })).data;
  const registered = await call('POST', '/api/auth/register', { body: { role: 'BUYER', name: 'Pedro', email: 'pedro@correo.co', password: 'clave123' } });
  assert.equal(registered.status, 201);
  const buyer = registered.data;
  assert.equal(buyer.user.type, 'CONSUMER');

  assert.equal((await call('POST', '/api/listings', { body: { product: 'Haba', price: 3000, quantity: 20 } })).status, 401);
  assert.equal((await call('POST', '/api/listings', { token: buyer.token, body: { product: 'Haba', price: 3000, quantity: 20 } })).status, 403);
  const { status, data: listing } = await call('POST', '/api/listings', { token: producer.token, body: { product: 'Haba', description: 'Haba verde', price: 3000, quantity: 20 } });
  assert.equal(status, 201);
  assert.equal(listing.photo, null);

  const { data: list } = await call('GET', '/api/listings');
  assert.ok(list.some((l) => l.id === listing.id && l.price === 3000));

  assert.equal((await call('GET', '/api/cart', { token: producer.token })).status, 403);
  assert.equal((await call('POST', '/api/cart/items', { token: buyer.token, body: { listingId: listing.id, quantity: 4 } })).status, 201);
  const checkout = await call('POST', '/api/cart/checkout', { token: buyer.token });
  assert.equal(checkout.status, 201);
  assert.equal(checkout.data.total, 12000);

  const { data: mine } = await call('GET', '/api/listings/mine', { token: producer.token });
  assert.equal(mine.find((l) => l.id === listing.id).soldQuantity, 4);
  const blocked = await call('DELETE', `/api/listings/${listing.id}`, { token: producer.token });
  assert.equal(blocked.status, 409); // it already has orders

  const { data: orders } = await call('GET', '/api/orders', { token: producer.token });
  assert.ok(orders.some((o) => o.buyerName === 'Pedro' && o.quantity === 4 && o.product === 'Haba'));
  assert.equal((await call('GET', '/api/auth/me', { token: buyer.token })).data.name, 'Pedro');
});

test('HTTP: SSR with ISR cache (MISS → HIT → invalidation through the gRPC stream) and Server-Timing', async () => {
  const r1 = await fetch(`${base}/productores/p-rosa`);
  assert.equal(r1.headers.get('x-cache-isr'), 'MISS');
  assert.match(await r1.text(), /La Esperanza/);
  assert.match(r1.headers.get('server-timing'), /app;dur=.*catalog\.GetProducerProfile;dur=/);

  const r2 = await fetch(`${base}/productores/p-rosa`);
  assert.equal(r2.headers.get('x-cache-isr'), 'HIT');

  const { data: { token } } = await call('POST', '/api/auth/login', { body: { email: 'rosa@delcampo.co', password: 'campo123' } });
  await call('PATCH', '/api/harvests/cos-1', { token, body: { unitPrice: 2700 } });
  await new Promise((resolve) => setTimeout(resolve, 100)); // the event travels through the stream
  const r3 = await fetch(`${base}/productores/p-rosa`);
  assert.equal(r3.headers.get('x-cache-isr'), 'MISS');

  const api = await fetch(`${base}/api/catalog`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(api.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const evil = await fetch(`${base}/api/catalog`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
});

test('HTTP: same error format, query validation, unknown routes and request id', async () => {
  const notFound = await call('GET', '/api/listings/nope');
  assert.equal(notFound.status, 404);
  assert.deepEqual(notFound.data, { error: 'Cosecha no encontrado', type: 'NotFound' });
  assert.equal((await call('GET', '/api/producers/nearby')).data.error, 'lat y lng son obligatorios');
  assert.equal((await call('GET', '/api/prices/yuca')).status, 404);
  assert.equal((await call('GET', '/api/prices/arveja')).data.fairRange.min, 3900);
  assert.equal((await call('GET', '/api/nope')).status, 404);
  const traced = await call('GET', '/api/season', { headers: { 'X-Request-Id': 'trace-123' } });
  assert.equal(traced.headers.get('x-request-id'), 'trace-123');

  const conflict = await call('POST', '/api/auth/register', { body: { role: 'PRODUCER', name: 'Rosa', email: 'rosa@delcampo.co', password: 'secreta1' } });
  assert.equal(conflict.status, 409);
});

test('HTTP: photo upload travels to catalog-service as bytes and is served at /uploads', async () => {
  const { data: { token } } = await call('POST', '/api/auth/login', { body: { email: 'rosa@delcampo.co', password: 'campo123' } });
  const notImage = await fetch(`${base}/api/listings/cos-2/photo`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' }, body: 'hola' });
  assert.equal(notImage.status, 400);
  const tooBig = await fetch(`${base}/api/listings/cos-2/photo`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/webp' }, body: Buffer.alloc(700 * 1024) });
  assert.equal(tooBig.status, 413);

  const image = Buffer.from('RIFF0000WEBPVP8 fake-image');
  const uploaded = await fetch(`${base}/api/listings/cos-2/photo`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/webp' }, body: image });
  assert.equal(uploaded.status, 201);
  const { photo } = await uploaded.json();
  const served = await fetch(base + photo);
  assert.equal(served.status, 200);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), image);
});

test('HTTP: offline sync batch and metrics', async () => {
  const { data: { token } } = await call('POST', '/api/auth/login', { body: { email: 'luis@delcampo.co', password: 'campo123' } });
  const op = { opId: 'http-1', type: 'CREATE_HARVEST', entityId: 'http-h1', timestamp: new Date().toISOString(),
    data: { product: 'Haba', estimatedQuantity: 50, unitPrice: 3000, availableOn: '2026-12-01' } };
  const first = await call('POST', '/api/sync', { token, body: { operations: [op] }, headers: { 'X-Device-Id': 'phone-A' } });
  assert.equal(first.data.results[0].status, 'APPLIED');
  assert.equal(first.data.results[0].deviceId, 'phone-A');
  const again = await call('POST', '/api/sync', { token, body: { operations: [op] } });
  assert.equal(again.data.results[0].repeated, true);
  assert.equal((await call('POST', '/api/sync', { token, body: { operations: 'x' } })).data.error, 'operations debe ser un arreglo');

  const beacon = await fetch(`${base}/api/metrics`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify([{ name: 'LCP', value: 1800 }]) });
  assert.equal(beacon.status, 204);
  const { data: summary } = await call('GET', '/api/metrics/summary');
  assert.equal(summary.find((m) => m.name === 'LCP').rating, 'GOOD');
});
