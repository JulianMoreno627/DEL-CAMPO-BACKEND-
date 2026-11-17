import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GrpcServer, GrpcClient, runWithContext } from '@del-campo/shared';
import { createContainer } from '../src/container.js';
import { registerUserGrpcApi } from '../src/UserGrpcApi.js';

let server;
let client;
let avatarsDir;
const as = (userId, fn) => runWithContext({ userId }, fn);

before(async () => {
  avatarsDir = await mkdtemp(path.join(tmpdir(), 'delcampo-avatars-'));
  const container = await createContainer({ tokenSecret: 'test-secret', avatarsDir });
  server = new GrpcServer({ name: 'user' });
  registerUserGrpcApi(server, container.controller);
  client = new GrpcClient('user', { address: `127.0.0.1:${await server.start(0)}` });
});

after(async () => {
  client.close();
  await server.stop();
  await rm(avatarsDir, { recursive: true, force: true });
});

test('UpdateProfile: only the fields that are sent change, for the user of the metadata', async () => {
  const user = await as('p-rosa', () => client.call('UpdateProfile', { town: 'Tunja', phone: '300 123 4567' }));
  assert.equal(user.id, 'p-rosa');
  assert.equal(user.town, 'Tunja');
  assert.equal(user.phone, '300 123 4567');
  assert.equal(user.farm, 'La Esperanza'); // not sent → unchanged
  assert.equal(user.version, 2);

  await assert.rejects(as('p-rosa', () => client.call('UpdateProfile', { name: '' })), (error) => error.status === 400);
  const buyer = await as('c-ana', () => client.call('UpdateProfile', { type: 'STORE', farm: 'No aplica' }));
  assert.equal(buyer.type, 'STORE');
  assert.equal(buyer.farm, undefined);
});

test('UploadAvatar / GetAvatar: the photo is stored, served in bytes and the previous one is deleted', async () => {
  const first = await as('c-ana', () => client.call('UploadAvatar', { content: Buffer.from('one'), contentType: 'image/webp' }));
  assert.match(first.avatar, /^\/avatars\/[\w-]+\.webp$/);
  const second = await as('c-ana', () => client.call('UploadAvatar', { content: Buffer.from('two'), contentType: 'image/png' }));
  assert.deepEqual(await readdir(avatarsDir), [second.avatar.replace('/avatars/', '')]);

  const stored = await client.call('GetAvatar', { fileName: second.avatar.replace('/avatars/', '') });
  assert.equal(stored.contentType, 'image/png');
  assert.equal(Buffer.from(stored.content).toString(), 'two');
  await assert.rejects(client.call('GetAvatar', { fileName: first.avatar.replace('/avatars/', '') }), (error) => error.status === 404);
  await assert.rejects(as('c-ana', () => client.call('UploadAvatar', { content: Buffer.from('x'), contentType: 'text/plain' })), /Envíe una imagen/);

  // The avatar travels with the user in the rest of the RPCs
  assert.equal((await client.call('GetUser', { id: 'c-ana' })).avatar, second.avatar);
  assert.equal((await client.call('GetUser', { id: 'p-jose' })).avatar, undefined);
});
