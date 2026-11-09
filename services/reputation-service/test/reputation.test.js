import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Reputation, Rating } from '../src/model/Reputation.js';
import { createTestContainer } from './fixtures.js';

test('Bayesian reputation: few ratings stay close to the mean', () => {
  const single = new Reputation([new Rating({ orderId: 'r', fromUserId: 'a', toUserId: 'b', scores: { quality: 5 } })]);
  assert.equal(single.score, 3.88);
  assert.equal(single.level, 'NEW');
  assert.throws(() => new Rating({ orderId: 'r', fromUserId: 'a', toUserId: 'b', scores: { quality: 6 } }), /1 a 5/);
});

test('rating: only a delivered order, only its parties, once, with the criteria of the rated user', async () => {
  const { reputationService } = await createTestContainer();
  await assert.rejects(reputationService.rate({ orderId: 'o-pending', fromUserId: 'c-ana', scores: { quality: 5, reliability: 5 } }), /entregada/);
  await assert.rejects(reputationService.rate({ orderId: 'o-delivered', fromUserId: 'c-tienda', scores: {} }), (error) => error.status === 403);
  await assert.rejects(reputationService.rate({ orderId: 'nope', fromUserId: 'c-ana', scores: {} }), /Reserva no encontrado/);
  await assert.rejects(reputationService.rate({ orderId: 'o-delivered', fromUserId: 'c-ana', scores: { paysOnTime: 5, seriousness: 5 } }),
    /Criterios esperados: quality, reliability/);

  const rating = await reputationService.rate({ orderId: 'o-delivered', fromUserId: 'c-ana', scores: { quality: 5, reliability: 4 }, comment: 'Muy buena' });
  assert.equal(rating.toUserId, 'p-rosa');
  await assert.rejects(reputationService.rate({ orderId: 'o-delivered', fromUserId: 'c-ana', scores: { quality: 1, reliability: 1 } }), /Ya calificó/);

  await reputationService.rate({ orderId: 'o-delivered', fromUserId: 'p-rosa', scores: { paysOnTime: 5, seriousness: 5 } });
  const reputation = await reputationService.reputationOf('p-rosa');
  assert.equal(reputation.total, 1);
  assert.deepEqual(reputation.byCriterion, { quality: 5, reliability: 4 });
  assert.equal(reputation.recent[0].comment, 'Muy buena');
});
