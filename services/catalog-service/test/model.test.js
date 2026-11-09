import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InvalidTransition } from '@del-campo/shared';
import { Harvest, HarvestStatus } from '../src/model/Harvest.js';

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
