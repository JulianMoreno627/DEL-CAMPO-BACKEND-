import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GrpcServer, GrpcClient, runWithContext } from '@del-campo/shared';
import { registerCatalogGrpcApi } from '../src/CatalogGrpcApi.js';
import { createTestContainer } from './fixtures.js';

let server;
let client;
let photosDir;

/** Calls as a logged-in user (the gateway propagates it in the metadata). */
const as = (userId, role, fn) => runWithContext({ userId, role }, fn);

before(async () => {
  photosDir = await mkdtemp(path.join(tmpdir(), 'delcampo-grpc-photos-'));
  const { controller } = await createTestContainer({ photosDir });
  server = new GrpcServer({ name: 'catalog' });
  registerCatalogGrpcApi(server, controller);
  client = new GrpcClient('catalog', { address: `127.0.0.1:${await server.start(0)}` });
});

after(async () => {
  client.close();
  await server.stop();
  await rm(photosDir, { recursive: true, force: true });
});

test('CatalogGrpcApi: a published listing travels as a message with its producer; unset photo is absent', async () => {
  const listing = await as('p-rosa', 'PRODUCER', () =>
    client.call('PublishListing', { product: 'Cubios', price: 3500, quantity: 40 }));
  assert.equal(listing.price, 3500);
  assert.equal(listing.photo, undefined);
  assert.deepEqual({ ...listing.producer }, { id: 'p-rosa', name: 'Rosa Pérez', town: 'Ventaquemada' });

  const { listings } = await as('p-rosa', 'PRODUCER', () => client.call('ListMyListings'));
  const mine = listings.find((l) => l.id === listing.id);
  assert.equal(mine.status, 'AVAILABLE');
  assert.equal(mine.soldQuantity, 0);
  assert.equal(mine.producer, null);
});

test('CatalogGrpcApi: partial edits only touch the sent fields and errors keep their status', async () => {
  const before = await client.call('GetListing', { id: 'cos-2' });
  const edited = await as('p-rosa', 'PRODUCER', () => client.call('EditListing', { id: 'cos-2', price: 4500 }));
  assert.equal(edited.price, 4500);
  assert.equal(edited.product, before.product);

  await assert.rejects(as('p-jose', 'PRODUCER', () => client.call('EditListing', { id: 'cos-2', price: 1 })),
    (error) => error.status === 403);
  await assert.rejects(client.call('ReserveHarvest', { harvestId: 'cos-3', quantity: 99999 }),
    (error) => error.status === 409 && /Solo quedan/.test(error.message));
  await assert.rejects(client.call('GetListing', { id: 'nope' }), (error) => error.status === 404 && error.message === 'Cosecha no encontrado');
});

test('CatalogGrpcApi: catalog items, harvest updates and photos as bytes', async () => {
  const { items } = await client.call('GetCatalog', { lat: 4.6486, lng: -74.0628, radiusKm: 40 });
  assert.ok(items.length > 0 && items.every((i) => i.distanceKm <= 40));
  assert.equal(items[0].price.evaluation, 'NO_REFERENCE');
  assert.equal(items[0].harvest.acceptsReservations, true);
  const { harvests: [soldOut] } = await client.call('GetHarvestsByIds', { ids: ['cos-4'] });
  assert.equal(soldOut.acceptsReservations, true);
  await client.call('ReserveHarvest', { harvestId: 'cos-4', quantity: 400 });
  const { harvests: [full] } = await client.call('GetHarvestsByIds', { ids: ['cos-4'] });
  assert.equal(full.acceptsReservations, false); // the rule is computed by catalog-service

  const { harvest, applied } = await as('p-luis', 'PRODUCER', () =>
    client.call('UpdateHarvest', { id: 'cos-7', changes: { description: 'Fresa de Chía' } }));
  assert.deepEqual(applied, ['description']);
  assert.equal(harvest.unitPrice, 7800);

  const photo = await as('p-luis', 'PRODUCER', () =>
    client.call('UploadHarvestPhoto', { id: 'cos-7', content: Buffer.from('RIFF....WEBP'), contentType: 'image/webp' }));
  assert.match(photo.photo, /\.webp$/);
});

test('CatalogGrpcApi: sync batch keeps the shape of each result (applied only on updates)', async () => {
  const result = await as('p-rosa', 'PRODUCER', () => client.call('ApplySyncBatch', {
    deviceId: 'phone-A',
    operationsIsList: true,
    operations: [
      { opId: 'g-1', type: 'CREATE_HARVEST', entityId: 'grpc-1', timestamp: '2026-01-01T00:00:00Z',
        data: { product: 'Haba', estimatedQuantity: 5, unitPrice: 1000, availableOn: '2026-12-01' } },
      { opId: 'g-2', type: 'UPDATE_HARVEST', entityId: 'cos-5', timestamp: '2026-01-02T00:00:00Z', data: { unitPrice: 1 } },
    ],
  }));
  const [created, rejected] = result.results;
  assert.equal(created.status, 'APPLIED');
  assert.equal(created.applied, null);
  assert.equal(created.entity.id, 'grpc-1');
  assert.equal(created.deviceId, 'phone-A');
  assert.equal(rejected.status, 'REJECTED');
  assert.match(rejected.message, /dueño/);

  await assert.rejects(as('p-rosa', 'PRODUCER', () => client.call('ApplySyncBatch', { operationsIsList: false })),
    /operations debe ser un arreglo/);
});

test('CatalogGrpcApi: WatchHarvestChanges streams every change (used to invalidate the ISR cache)', async () => {
  const stream = client.stream('WatchHarvestChanges');
  stream.on('error', () => {}); // cancelling the stream at the end emits CANCELLED
  await new Promise((resolve) => setTimeout(resolve, 50)); // the subscription is registered on the server
  await client.call('ReleaseHarvest', { harvestId: 'cos-8', quantity: 0 });
  const [change] = await once(stream, 'data');
  assert.deepEqual({ ...change }, { harvestId: 'cos-8', producerId: 'p-luis' });
  stream.cancel();
});
