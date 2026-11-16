import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GrpcServer, GrpcClient, runWithContext } from '@del-campo/shared';
import { createContainer } from '../src/container.js';
import { registerPricingGrpcApi } from '../src/PricingGrpcApi.js';
import { ProductRecognizer, parseModelJson } from '../src/clients/ProductRecognizer.js';

/** Test double of an AI provider: answers what it is told, or fails. */
class FakeRecognizer extends ProductRecognizer {
  constructor(name, answer) {
    super();
    this.providerName = name;
    this.answer = answer;
    this.calls = 0;
  }

  get name() {
    return this.providerName;
  }

  async recognize() {
    this.calls += 1;
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  }
}

const photo = { content: Buffer.from('RIFF0000WEBPVP8 fake'), contentType: 'image/webp' };
const carrot = { recognized: true, product: 'Zanahoria con hoja', category: 'vegetables', unit: 'atado', description: 'Zanahorias con hojas verdes.', confidence: 0.97, photoTip: '' };
const quiet = { warn: () => {} };

async function assistantWith(...recognizers) {
  const container = await createContainer({ recognizers });
  container.listingAssistant.log = quiet;
  return container.listingAssistant;
}

test('assistant: suggests the listing and finds the fair price even if the name is not exact', async () => {
  const assistant = await assistantWith(new FakeRecognizer('gemini', carrot));
  const { suggestion, reference } = await assistant.suggest('p-rosa', photo);
  assert.equal(suggestion.product, 'Zanahoria con hoja');
  assert.equal(suggestion.provider, 'gemini');
  assert.equal(reference.product, 'zanahoria'); // "Zanahoria con hoja" → zanahoria
  assert.deepEqual(reference.fairRange, { min: 1500, max: 2125 });
});

test('assistant: if Gemini fails, Groq answers (fallback) and the producer does not notice', async () => {
  const gemini = new FakeRecognizer('gemini', Object.assign(new Error('quota'), { status: 429 }));
  const groq = new FakeRecognizer('groq', { ...carrot, product: 'Tomate de arbol' });
  const assistant = await assistantWith(gemini, groq);
  const { suggestion, reference } = await assistant.suggest('p-rosa', photo);
  assert.equal(suggestion.provider, 'groq');
  assert.equal(reference.product, 'tomate de árbol'); // accents are ignored
  assert.deepEqual([gemini.calls, groq.calls], [1, 1]);
});

test('assistant: all providers down → 503 with a clear message; no keys → disabled', async () => {
  const assistant = await assistantWith(new FakeRecognizer('gemini', new Error('timeout')), new FakeRecognizer('groq', new Error('500')));
  await assert.rejects(assistant.suggest('p-rosa', photo), (error) => error.status === 503 && /Complete los datos a mano/.test(error.message));
  const disabled = await assistantWith();
  assert.equal(disabled.enabled, false);
  await assert.rejects(disabled.suggest('p-rosa', photo), (error) => error.status === 503 && /no está configurado/.test(error.message));
});

test('assistant: a photo without a farm product has no price; invalid photos are rejected before calling the AI', async () => {
  const ai = new FakeRecognizer('gemini', { recognized: false, product: '', photoTip: 'Tome la foto al producto.' });
  const assistant = await assistantWith(ai);
  const { suggestion, reference } = await assistant.suggest('p-rosa', photo);
  assert.equal(suggestion.recognized, false);
  assert.equal(reference, null);

  await assert.rejects(assistant.suggest('p-rosa', { content: Buffer.from('x'), contentType: 'text/plain' }), /Envíe una imagen/);
  await assert.rejects(assistant.suggest('p-rosa', { content: Buffer.alloc(700 * 1024), contentType: 'image/webp' }), (error) => error.status === 413);
  assert.equal(ai.calls, 1);
});

test('assistant: each producer has a usage limit, so nobody burns the free quota', async () => {
  const container = await createContainer({ recognizers: [new FakeRecognizer('gemini', carrot)], ai: { limit: { maxRequests: 2, windowMs: 60_000 } } });
  const assistant = container.listingAssistant;
  await assistant.suggest('p-rosa', photo);
  await assistant.suggest('p-rosa', photo);
  await assert.rejects(assistant.suggest('p-rosa', photo), (error) => error.status === 429);
  await assistant.suggest('p-jose', photo); // another producer has their own limit
});

test('parseModelJson accepts JSON wrapped in ``` fences and rejects text', () => {
  assert.deepEqual(parseModelJson('```json\n{"product":"Mora"}\n```'), { product: 'Mora' });
  assert.throws(() => parseModelJson('Es una mora'), /valid JSON/);
});

test('PricingGrpcApi: SuggestListing travels as a message with the photo in bytes and the producer in the metadata', async () => {
  const container = await createContainer({ recognizers: [new FakeRecognizer('gemini', carrot)], ai: { limit: { maxRequests: 1, windowMs: 60_000 } } });
  const server = new GrpcServer({ name: 'pricing' });
  registerPricingGrpcApi(server, container.controller);
  const client = new GrpcClient('pricing', { address: `127.0.0.1:${await server.start(0)}` });
  try {
    const suggestion = await runWithContext({ userId: 'p-rosa', role: 'PRODUCER' }, () =>
      client.call('SuggestListing', { content: photo.content, contentType: photo.contentType }));
    assert.equal(suggestion.recognized, true);
    assert.equal(suggestion.unit, 'atado');
    assert.equal(suggestion.reference.fairRange.max, 2125);
    // The limit is per producer of the metadata: the second request of the same producer is refused
    await assert.rejects(runWithContext({ userId: 'p-rosa' }, () =>
      client.call('SuggestListing', { content: photo.content, contentType: photo.contentType })), (error) => error.status === 429);
  } finally {
    client.close();
    await server.stop();
  }
});
