import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionToken, parseDatabaseUrl, InMemoryRepository, VersionConflict, Entity } from '../src/index.js';

test('session token: valid, tampered, foreign and expired', () => {
  const tokens = new SessionToken('secret-A');
  const token = tokens.sign({ sub: 'p-rosa', role: 'PRODUCER' });
  assert.equal(tokens.verify(token).sub, 'p-rosa');

  const [, signature] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'c-ana', role: 'BUYER', exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal(tokens.verify(`${forged}.${signature}`), null);
  assert.equal(new SessionToken('secret-B').verify(token), null);
  assert.equal(tokens.verify(tokens.sign({ sub: 'x', role: 'BUYER' }, -1)), null);
  assert.equal(tokens.verify('garbage'), null);
  assert.throws(() => new SessionToken(''), /TOKEN_SECRET/);
});

test('Neon URL: SSL is configured explicitly and removed from the connection string', () => {
  const neon = parseDatabaseUrl('postgresql://user:pw@ep-cool-1234-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
  assert.equal(neon.connectionString, 'postgresql://user:pw@ep-cool-1234-pooler.us-west-2.aws.neon.tech/neondb');
  assert.deepEqual(neon.ssl, { rejectUnauthorized: true });
  assert.equal(neon.enableChannelBinding, true);

  assert.equal(parseDatabaseUrl('postgres://u:p@localhost:5432/db').ssl, false);
  assert.equal(parseDatabaseUrl('postgres://u:p@db.example.com/db?sslmode=disable').ssl, false);
});

test('in-memory repository keeps optimistic concurrency control', async () => {
  class Thing extends Entity {}
  const repo = new InMemoryRepository('Cosa', (data) => new Thing(data));
  const thing = new Thing({ id: 't1' });
  await repo.save(thing);
  const copy = await repo.get('t1');
  copy.touch();
  await repo.save(copy, { expectedVersion: 1 });
  thing.touch();
  await assert.rejects(repo.save(thing, { expectedVersion: 1 }), VersionConflict);
  await assert.rejects(repo.getOrFail('nope'), /Cosa no encontrado/);
});
