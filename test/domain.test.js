import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Order } from '../src/domain/Order.js';
import { Reputation, Rating } from '../src/domain/Reputation.js';
import { InvalidTransition } from '../src/domain/errors.js';

test('an order follows its life cycle and computes the total', () => {
  const order = new Order({ harvestId: 'h', producerId: 'p', buyerId: 'b', quantity: 10, unitPrice: 2500 });
  assert.equal(order.total, 25000);
  order.changeStatus('CONFIRMED');
  order.changeStatus('DELIVERED');
  assert.equal(order.completed, true);
  assert.throws(() => order.changeStatus('CANCELLED'), InvalidTransition);
});

test('Bayesian reputation: few ratings stay close to the mean', () => {
  const single = new Reputation([new Rating({ orderId: 'r', fromUserId: 'a', toUserId: 'b', scores: { quality: 5 } })]);
  assert.equal(single.score, 3.88);
  assert.equal(single.level, 'NEW');
  assert.throws(() => new Rating({ orderId: 'r', fromUserId: 'a', toUserId: 'b', scores: { quality: 6 } }), /1 a 5/);
});
