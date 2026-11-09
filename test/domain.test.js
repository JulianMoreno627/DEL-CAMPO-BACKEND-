import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Reputation, Rating } from '../src/domain/Reputation.js';

test('Bayesian reputation: few ratings stay close to the mean', () => {
  const single = new Reputation([new Rating({ orderId: 'r', fromUserId: 'a', toUserId: 'b', scores: { quality: 5 } })]);
  assert.equal(single.score, 3.88);
  assert.equal(single.level, 'NEW');
  assert.throws(() => new Rating({ orderId: 'r', fromUserId: 'a', toUserId: 'b', scores: { quality: 6 } }), /1 a 5/);
});
