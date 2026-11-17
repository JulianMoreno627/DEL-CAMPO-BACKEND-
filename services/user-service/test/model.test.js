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

test('profile: each user edits its own fields; everything is validated before changing anything', () => {
  const producer = new Producer({ name: 'Rosa', farm: 'La Esperanza', village: 'El Rosal' });
  assert.deepEqual(producer.updateProfile({ name: ' Rosa Pérez ', town: 'Ventaquemada', role: 'BUYER', crops: ['x'] }), ['name', 'town']);
  assert.equal(producer.name, 'Rosa Pérez');
  assert.equal(producer.role, 'PRODUCER'); // not editable
  assert.equal(producer.version, 2);

  assert.throws(() => producer.updateProfile({ name: 'Otra', phone: 'llámeme' }), /Teléfono inválido/);
  assert.equal(producer.name, 'Rosa Pérez'); // nothing changed (all or nothing)
  assert.throws(() => producer.updateProfile({ farm: '  ' }), /finca es obligatorio/);
  assert.deepEqual(producer.updateProfile({ name: 'Rosa Pérez' }), []); // same value: no new version
  assert.equal(producer.version, 2);

  const buyer = new Buyer({ name: 'Ana' });
  assert.deepEqual(buyer.updateProfile({ type: 'RESTAURANT', farm: 'No aplica' }), ['type']);
  assert.throws(() => buyer.updateProfile({ type: 'BANK' }), /Tipo de comprador inválido/);
});

test('profile photo: changing it returns the previous one (to delete it)', () => {
  const buyer = new Buyer({ name: 'Ana' });
  assert.equal(buyer.toJSON().avatar, null);
  assert.equal(buyer.changeAvatar('/avatars/a.webp'), null);
  assert.equal(buyer.changeAvatar('/avatars/b.webp'), '/avatars/a.webp');
  assert.equal(buyer.toJSON().avatar, '/avatars/b.webp');
});
