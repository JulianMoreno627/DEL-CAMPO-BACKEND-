import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  userJson, harvestJson, listingJson, myListingJson, catalogItemJson, cartJson, orderDetailJson, syncResultJson,
} from '../src/gateway/restMappers.js';

const harvestMessage = {
  id: 'h1', version: 2, updatedAt: '2026-11-09T00:00:00.000Z', producerId: 'p-rosa', product: 'Arveja',
  category: 'vegetables', unit: 'kg', estimatedQuantity: 300, reservedQuantity: 10, freeQuantity: 290,
  unitPrice: 4200, availableOn: '2026-11-09', description: '', status: 'AVAILABLE',
  fieldTimestamps: { unitPrice: '2026-11-09T00:00:00.000Z' }, acceptsReservations: true,
};

test('REST mappers: a producer and a buyer keep the fields of the old API (no internal fields)', () => {
  const base = { id: 'x', version: 1, updatedAt: 't', name: 'N', phone: '', location: null, crops: [], ratingCriteria: ['a'] };
  assert.deepEqual(Object.keys(userJson({ ...base, role: 'PRODUCER', farm: 'F', village: 'V', town: 'T' })),
    ['id', 'version', 'updatedAt', 'role', 'name', 'phone', 'location', 'farm', 'village', 'town', 'crops']);
  assert.deepEqual(userJson({ ...base, role: 'BUYER', type: 'STORE' }),
    { id: 'x', version: 1, updatedAt: 't', role: 'BUYER', name: 'N', phone: '', location: null, type: 'STORE' });
});

test('REST mappers: a harvest without photo or planting date has null (not missing) fields', () => {
  const json = harvestJson(harvestMessage);
  assert.equal(json.photo, null);
  assert.equal(json.plantedOn, null);
  assert.equal('acceptsReservations' in json, false);
  assert.deepEqual(Object.keys(json), ['id', 'version', 'updatedAt', 'producerId', 'product', 'category', 'unit',
    'estimatedQuantity', 'reservedQuantity', 'freeQuantity', 'unitPrice', 'plantedOn', 'availableOn', 'description',
    'photo', 'status', 'fieldTimestamps']);
});

test('REST mappers: listing, own listing and catalog item, as JSON.stringify sees them', () => {
  const listing = { id: 'h1', product: 'Arveja', description: '', price: 4200, unit: 'kg', availableQuantity: 290,
    availableOn: '2026-11-09', publishedAt: 't', producer: { id: 'p-rosa', name: 'Rosa', town: 'V' } };
  assert.deepEqual(JSON.parse(JSON.stringify(listingJson(listing))), { ...listing, photo: null });
  const mine = JSON.parse(JSON.stringify(myListingJson({ ...listing, producer: null, status: 'AVAILABLE', soldQuantity: 10 })));
  assert.equal('producer' in mine, false);
  assert.equal(mine.soldQuantity, 10);

  const item = JSON.parse(JSON.stringify(catalogItemJson({
    harvest: harvestMessage, producer: null, price: { evaluation: 'NO_REFERENCE', reference: null },
  })));
  assert.equal('producer' in item, false); // the producer no longer exists
  assert.equal(item.distanceKm, null);
  assert.deepEqual(item.price, { evaluation: 'NO_REFERENCE', reference: null });
});

test('REST mappers: cart line of a deleted listing, order detail and sync results', () => {
  assert.deepEqual(cartJson({ items: [{ listingId: 'gone', quantity: 2, found: false }], total: 0 }),
    { items: [{ listingId: 'gone', quantity: 2, product: null, available: false, subtotal: 0 }], total: 0 });

  const detail = JSON.parse(JSON.stringify(orderDetailJson({ order: { id: 'o', status: 'PENDING', completed: false } })));
  assert.equal('completed' in detail, false);
  assert.equal('product' in detail, false); // the listing no longer exists: the field is left out, as before

  const created = syncResultJson({ opId: 'a', type: 'CREATE_HARVEST', entityId: 'h1', status: 'APPLIED', applied: null, conflicts: null, entity: harvestMessage, deviceId: 'd', repeated: false });
  assert.deepEqual(Object.keys(created), ['opId', 'type', 'entityId', 'status', 'entity', 'deviceId']);
  const rejected = syncResultJson({ opId: 'b', type: 'UPDATE_HARVEST', entityId: 'x', status: 'REJECTED', message: 'No es el dueño', entity: null, deviceId: 'd', repeated: true });
  assert.equal(rejected.entity, null);
  assert.equal(rejected.repeated, true);
  assert.equal('applied' in rejected, false);
});
