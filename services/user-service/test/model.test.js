import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '@del-campo/shared';
import { Producer, Buyer, User } from '../src/model/User.js';
import { Coordinate } from '../src/model/Coordinate.js';

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
