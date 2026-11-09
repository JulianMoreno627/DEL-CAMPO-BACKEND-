import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { GrpcServer, GrpcClient } from '@del-campo/shared';
import { createContainer } from '../src/container.js';
import { registerUserGrpcApi } from '../src/UserGrpcApi.js';
import { DEMO_PASSWORD } from '../src/seed.js';

let server;
let client;

before(async () => {
  const container = await createContainer({ tokenSecret: 'test-secret' });
  server = new GrpcServer({ name: 'user' });
  registerUserGrpcApi(server, container.controller);
  const port = await server.start(0);
  client = new GrpcClient('user', { address: `127.0.0.1:${port}` });
});

after(async () => {
  client.close();
  await server.stop();
});

test('UserGrpcApi: Register → Session message with the user and its rating criteria', async () => {
  const session = await client.call('Register', {
    role: 'BUYER', name: 'Pedro', email: 'pedro@correo.co', password: 'clave123', type: 'RESTAURANT',
  });
  assert.ok(session.token.includes('.'));
  assert.equal(session.user.role, 'BUYER');
  assert.equal(session.user.type, 'RESTAURANT');
  assert.equal(session.user.location, null);
  assert.equal(session.user.farm, undefined); // optional field not set → not sent
  assert.deepEqual(session.user.ratingCriteria, ['paysOnTime', 'seriousness']);
});

test('UserGrpcApi: login with the wrong profile is 403 and a wrong password is 401', async () => {
  await assert.rejects(client.call('Login', { email: 'rosa@delcampo.co', password: DEMO_PASSWORD, role: 'BUYER' }),
    (error) => error.status === 403 && /ingrese como productor/.test(error.message));
  await assert.rejects(client.call('Login', { email: 'rosa@delcampo.co', password: 'x' }), (error) => error.status === 401);
  const { user } = await client.call('Login', { email: 'rosa@delcampo.co', password: DEMO_PASSWORD, role: 'PRODUCER' });
  assert.equal(user.farm, 'La Esperanza');
  assert.deepEqual(user.location, { lat: 5.3667, lng: -73.5214 });
  assert.deepEqual(user.crops, ['papa criolla', 'arveja']);
});

test('UserGrpcApi: GetUser NOT_FOUND, GetUsersByIds skips missing ids, producers and nearby', async () => {
  await assert.rejects(client.call('GetUser', { id: 'nobody' }), (error) => error.status === 404 && error.message === 'Usuario no encontrado');
  const { users } = await client.call('GetUsersByIds', { ids: ['p-rosa', 'nobody', 'c-ana'] });
  assert.deepEqual(users.map((u) => u.id).sort(), ['c-ana', 'p-rosa']);
  assert.equal((await client.call('ListProducers')).users.length, 4);

  const { producers } = await client.call('NearbyProducers', { lat: 4.6486, lng: -74.0628, radiusKm: 40 });
  assert.deepEqual(producers.map((p) => p.producer.id), ['p-jose', 'p-luis']);
  await assert.rejects(client.call('NearbyProducers', { lat: 100, lng: 0 }), /Latitud inválida/);
});
