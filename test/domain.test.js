import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Harvest, HarvestStatus } from '../src/domain/Harvest.js';
import { Order } from '../src/domain/Order.js';
import { Coordinate } from '../src/domain/Coordinate.js';
import { Producer, Buyer, User } from '../src/domain/User.js';
import { Reputation, Rating } from '../src/domain/Reputation.js';
import { FairPriceCalculator } from '../src/domain/FairPrice.js';
import { Cart } from '../src/domain/Cart.js';
import { InvalidTransition, DomainError } from '../src/domain/errors.js';

const newHarvest = (extra = {}) => new Harvest({
  producerId: 'p1', product: 'Papa criolla', estimatedQuantity: 100, unitPrice: 2500,
  availableOn: '2026-11-01', ...extra,
});

test('a harvest follows the state machine planted → growing → available → sold out', () => {
  const h = newHarvest();
  assert.equal(h.status, HarvestStatus.PLANTED);
  h.advanceTo('GROWING');
  h.advanceTo('AVAILABLE');
  h.advanceTo('SOLD_OUT');
  assert.equal(h.status, 'SOLD_OUT');
  assert.throws(() => h.advanceTo('AVAILABLE'), InvalidTransition);
});

test('states cannot be skipped', () => {
  assert.throws(() => newHarvest().advanceTo('AVAILABLE'), InvalidTransition);
});

test('an advance reservation reduces the free quantity and sells out when available', () => {
  const h = newHarvest({ status: 'AVAILABLE' });
  h.reserve(60);
  assert.equal(h.freeQuantity, 40);
  assert.throws(() => h.reserve(41), /Solo quedan 40/);
  h.reserve(40);
  assert.equal(h.status, 'SOLD_OUT');
  assert.equal(h.acceptsReservations(), false);
});

test('a harvest that is still growing can be reserved', () => {
  const h = newHarvest({ status: 'GROWING' });
  h.reserve(100);
  assert.equal(h.status, 'GROWING'); // it does not sell out until it is available
  assert.equal(h.acceptsReservations(), false);
});

test('releasing quantity puts a harvest that sold out by reservations back on sale', () => {
  const h = newHarvest({ status: 'AVAILABLE' });
  h.reserve(100);
  assert.equal(h.status, 'SOLD_OUT');
  h.release(30);
  assert.equal(h.status, 'AVAILABLE');
  assert.equal(h.freeQuantity, 30);
});

test('the estimate cannot be lower than what is already reserved', () => {
  const h = newHarvest();
  h.reserve(70);
  assert.throws(() => h.applyChanges({ estimatedQuantity: 50 }), /reservados/);
  assert.equal(h.estimatedQuantity, 100);
});

test('applyChanges resolves conflicts field by field (Last-Writer-Wins)', () => {
  const h = newHarvest();
  h.applyChanges({ unitPrice: 2800 }, '2026-10-10T10:00:00.000Z');
  // Offline change made EARLIER (09:00) on another device: the price loses, the quantity is applied
  const result = h.applyChanges({ unitPrice: 2000, estimatedQuantity: 120 }, '2026-10-10T09:00:00.000Z');
  assert.deepEqual(result.applied, ['estimatedQuantity']);
  assert.deepEqual(result.conflicts, ['unitPrice']);
  assert.equal(h.unitPrice, 2800);
  assert.equal(h.estimatedQuantity, 120);
});

test('applyChanges is atomic: if one field is invalid nothing changes', () => {
  const h = newHarvest();
  assert.throws(() => h.applyChanges({ unitPrice: 3000, status: 'SOLD_OUT' }), InvalidTransition);
  assert.equal(h.unitPrice, 2500);
  assert.equal(h.version, 1);
});

test('an order follows its life cycle and computes the total', () => {
  const order = new Order({ harvestId: 'h', producerId: 'p', buyerId: 'b', quantity: 10, unitPrice: 2500 });
  assert.equal(order.total, 25000);
  order.changeStatus('CONFIRMED');
  order.changeStatus('DELIVERED');
  assert.equal(order.completed, true);
  assert.throws(() => order.changeStatus('CANCELLED'), InvalidTransition);
});

test('User is abstract and subclasses define their own criteria (polymorphism)', () => {
  assert.throws(() => new User({ name: 'x', location: { lat: 0, lng: 0 } }), TypeError);
  const producer = new Producer({ name: 'Rosa', village: 'El Rosal', location: { lat: 5, lng: -73 } });
  const buyer = new Buyer({ name: 'Ana', location: { lat: 4.6, lng: -74 } });
  assert.deepEqual(producer.ratingCriteria(), ['quality', 'reliability']);
  assert.deepEqual(buyer.ratingCriteria(), ['paysOnTime', 'seriousness']);
});

test('Haversine distance Bogotá–Tunja ≈ 115 km', () => {
  const d = new Coordinate(4.711, -74.0721).distanceKm(new Coordinate(5.5353, -73.3678));
  assert.ok(d > 110 && d < 125, `distance ${d}`);
  assert.throws(() => new Coordinate(100, 0), DomainError);
});

test('Bayesian reputation: few ratings stay close to the mean', () => {
  const single = new Reputation([new Rating({ orderId: 'r', fromUserId: 'a', toUserId: 'b', scores: { quality: 5 } })]);
  assert.equal(single.score, 3.88);
  assert.equal(single.level, 'NEW');
  assert.throws(() => new Rating({ orderId: 'r', fromUserId: 'a', toUserId: 'b', scores: { quality: 6 } }), /1 a 5/);
});

test('fair price: evaluates against the suggested market range', () => {
  const calculator = new FairPriceCalculator(new Map([['papa criolla', { marketPrice: 4000, middlemanPrice: 1300, unit: 'kg' }]]));
  assert.deepEqual(calculator.reference('Papa criolla').fairRange, { min: 2400, max: 3400 });
  assert.equal(calculator.evaluate('Papa criolla', 1300), 'LOW');
  assert.equal(calculator.evaluate('Papa criolla', 3000), 'FAIR');
  assert.equal(calculator.evaluate('Papa criolla', 3900), 'HIGH');
  assert.equal(calculator.evaluate('Yuca', 1000), 'NO_REFERENCE');
});

test('Cart: positive quantities and quantity 0 removes the product', () => {
  const cart = new Cart({ buyerId: 'c-ana' });
  cart.add('a1', 2);
  assert.equal(cart.id, 'c-ana');
  assert.throws(() => cart.add('a1', -1), /positiva/);
  cart.changeQuantity('a1', 0);
  assert.equal(cart.isEmpty, true);
});
