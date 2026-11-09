import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { FairPriceCalculator } from '../src/model/FairPrice.js';
import { MarketPrice } from '../src/model/MarketPrice.js';
import { MarketPriceRestClient } from '../src/clients/MarketPriceRestClient.js';
import { MarketPriceProvider } from '../src/clients/MarketPriceProvider.js';
import { createContainer } from '../src/container.js';

const quiet = { warn: () => {} };

test('fair price: evaluates against the suggested market range', () => {
  const calculator = new FairPriceCalculator(new Map([['papa criolla', { marketPrice: 4000, middlemanPrice: 1300, unit: 'kg' }]]));
  assert.deepEqual(calculator.reference('Papa criolla').fairRange, { min: 2400, max: 3400 });
  assert.equal(calculator.evaluate('Papa criolla', 1300), 'LOW');
  assert.equal(calculator.evaluate('Papa criolla', 3000), 'FAIR');
  assert.equal(calculator.evaluate('Papa criolla', 3900), 'HIGH');
  assert.equal(calculator.evaluate('Yuca', 1000), 'NO_REFERENCE');
});

test('without an external source it uses the saved prices (demo values the first time)', async () => {
  const { pricingService } = await createContainer();
  const reference = await pricingService.reference('Papa criolla');
  assert.deepEqual(reference, { product: 'Papa criolla', marketPrice: 4000, middlemanPrice: 1300, unit: 'kg', fairRange: { min: 2400, max: 3400 } });
  assert.equal(pricingService.lastSource, 'market_price');
  await assert.rejects(pricingService.reference('Yuca'), (error) => error.status === 404 && /Sin precio de referencia/.test(error.message));
});

test('a failing external source falls back to the last saved prices', async () => {
  class BrokenProvider extends MarketPriceProvider {
    get name() { return 'broken'; }
    async fetchAll() { throw new Error('timeout'); }
  }
  const { pricingService } = await createContainer({ provider: new BrokenProvider() });
  pricingService.log = quiet;
  const [evaluation] = await pricingService.evaluate([{ product: 'Mora', price: 6000 }]);
  assert.equal(evaluation.evaluation, 'FAIR');
  assert.equal(pricingService.lastSource, 'market_price');
});

test('REST client: reads the external API over HTTP, saves the prices and skips invalid rows', async () => {
  const api = http.createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer token-123');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [
      { product: 'Yuca', market_price: 3000, middleman_price: 900, unit: 'kg' },
      { product: '', marketPrice: 1 },
    ] }));
  });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${api.address().port}/precios`;
  try {
    const { pricingService, priceRepo } = await createContainer({ marketApi: { url, token: 'token-123' } });
    const reference = await pricingService.reference('yuca');
    assert.equal(reference.marketPrice, 3000);
    assert.equal(pricingService.lastSource, `REST 127.0.0.1:${api.address().port}`);
    assert.ok((await priceRepo.findAll()).some((p) => p.product === 'yuca' && p.source.startsWith('REST')));
  } finally {
    api.close();
  }
});

test('REST client: a slow API is cut by the timeout', async () => {
  const api = http.createServer(() => { /* never answers */ });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  try {
    const client = new MarketPriceRestClient({ url: `http://127.0.0.1:${api.address().port}`, timeoutMs: 200 });
    await assert.rejects(client.fetchAll(), /timeout|aborted/i);
  } finally {
    api.closeAllConnections();
    api.close();
  }
});

test('MarketPrice validates its data', () => {
  assert.throws(() => new MarketPrice({ product: 'papa', marketPrice: 0, middlemanPrice: 0 }), /positivo/);
  assert.equal(new MarketPrice({ product: ' Papa ', marketPrice: 1, middlemanPrice: 0 }).product, 'papa');
});
