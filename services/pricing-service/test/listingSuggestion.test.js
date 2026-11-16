import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ListingSuggestion } from '../src/model/ListingSuggestion.js';

test('ListingSuggestion keeps a good answer of the AI', () => {
  const s = new ListingSuggestion({
    recognized: true, product: 'papa criolla', category: 'tubers', unit: 'kg',
    description: 'Papa criolla recién lavada.', confidence: 0.93, photoTip: '',
  }, 'gemini');
  assert.deepEqual({ ...s }, {
    recognized: true, product: 'Papa criolla', category: 'tubers', unit: 'kg',
    description: 'Papa criolla recién lavada.', confidence: 0.93, photoTip: '', provider: 'gemini',
  });
});

test('ListingSuggestion normalizes values the platform does not accept', () => {
  const s = new ListingSuggestion({
    product: `  Mora   de\ncastilla ${'x'.repeat(80)}`, category: 'berries', unit: 'gramos',
    description: 'palabra '.repeat(60), confidence: 7, photoTip: 42,
  }, 'groq');
  assert.equal(s.recognized, true);
  assert.ok(s.product.length <= ListingSuggestion.MAX_PRODUCT);
  assert.ok(s.product.startsWith('Mora de castilla'));
  assert.equal(s.category, 'other');
  assert.equal(s.unit, 'kg');
  assert.ok(s.description.length <= ListingSuggestion.MAX_DESCRIPTION);
  assert.ok(s.description.endsWith('…'));
  assert.equal(s.confidence, 1);
  assert.equal(s.photoTip, '42');
});

test('ListingSuggestion: a photo without a farm product is not recognized (no invented data)', () => {
  const s = new ListingSuggestion({ recognized: false, product: 'Gato', description: 'Un gato', photoTip: 'Tome la foto al producto.' }, 'gemini');
  assert.equal(s.recognized, false);
  assert.equal(s.product, '');
  assert.equal(s.description, '');
  assert.equal(s.photoTip, 'Tome la foto al producto.');
  assert.equal(new ListingSuggestion(null, 'x').recognized, false);
});
