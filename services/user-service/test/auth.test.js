import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionToken } from '@del-campo/shared';
import { createContainer } from '../src/container.js';
import { DEMO_PASSWORD } from '../src/seed.js';

const newContainer = (tokenSecret = 'test-secret') => createContainer({ tokenSecret });

test('sign-up and login with a producer or buyer profile', async () => {
  const c = await newContainer();
  const { token, user } = await c.authService.register({
    role: 'PRODUCER', name: 'Marta Díaz', email: 'Marta@Correo.co', password: 'secreta1', town: 'Tibasosa',
  });
  assert.equal(user.role, 'PRODUCER');
  assert.equal(new SessionToken('test-secret').verify(token).sub, user.id);
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
  const c = await newContainer('secret-A');
  const verifier = new SessionToken('secret-A');
  const { token } = await c.authService.login({ email: 'ana@delcampo.co', password: DEMO_PASSWORD });
  const [body, signature] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'p-rosa', role: 'PRODUCER', exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal(verifier.verify(`${forged}.${signature}`), null);
  assert.equal(verifier.verify(`${body}.x`), null);
  assert.equal(verifier.verify('garbage'), null);

  const other = await newContainer('secret-B'); // another server with another secret
  const otherToken = (await other.authService.login({ email: 'ana@delcampo.co', password: DEMO_PASSWORD })).token;
  assert.equal(verifier.verify(otherToken), null);
});

test('nearby producers: sorted by distance, within the radius', async () => {
  const c = await newContainer();
  const nearby = await c.userService.nearbyProducers({ lat: 4.6486, lng: -74.0628, radiusKm: 40 });
  assert.deepEqual(nearby.map((n) => n.producer.id), ['p-jose', 'p-luis']);
  assert.ok(nearby[0].distanceKm <= nearby[1].distanceKm);
});
