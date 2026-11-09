import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { GrpcServer, GrpcClient, runWithContext } from '@del-campo/shared';
import { registerReputationGrpcApi } from '../src/ReputationGrpcApi.js';
import { createTestContainer } from './fixtures.js';

let server;
let client;

before(async () => {
  const { controller } = await createTestContainer();
  server = new GrpcServer({ name: 'reputation' });
  registerReputationGrpcApi(server, controller);
  client = new GrpcClient('reputation', { address: `127.0.0.1:${await server.start(0)}` });
});

after(async () => {
  client.close();
  await server.stop();
});

test('ReputationGrpcApi: who rates comes from the metadata; the rating travels as a message', async () => {
  const rating = await runWithContext({ userId: 'c-ana', role: 'BUYER' }, () =>
    client.call('Rate', { orderId: 'o-delivered', scores: { quality: 5, reliability: 3 } }));
  assert.equal(rating.fromUserId, 'c-ana');
  assert.equal(rating.toUserId, 'p-rosa');
  assert.deepEqual({ ...rating.scores }, { quality: 5, reliability: 3 });
  assert.equal(rating.comment, ''); // comment not sent → default
});

test('ReputationGrpcApi: a non-integer score is still rejected and GetReputation summarizes', async () => {
  await assert.rejects(runWithContext({ userId: 'p-rosa' }, () =>
    client.call('Rate', { orderId: 'o-delivered', scores: { paysOnTime: 4.5, seriousness: 5 } })), /entero de 1 a 5/);
  const reputation = await client.call('GetReputation', { userId: 'p-rosa' });
  assert.equal(reputation.total, 1);
  assert.equal(reputation.level, 'NEW');
  assert.equal(reputation.byCriterion.quality, 5);
  assert.equal(reputation.recent.length, 1);
});
