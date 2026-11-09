import { MarketPriceProvider } from './MarketPriceProvider.js';
import { MarketPrice } from '../model/MarketPrice.js';

/**
 * REST client of the external market price API. It is the ONLY communication of the whole
 * backend with a third party, and it goes over REST (HTTP + JSON), never gRPC.
 *
 * About SIPSA (DANE): the SIPSA entries in datos.gov.co are links to another site, not tabular
 * data (its Socrata API answers "no row or column access to non-tabular tables"), and the
 * official DANE web service is SOAP. So no REST URL is hard-coded here: it is configured with
 * MARKET_PRICES_API_URL when a REST source is available. Until then the service uses the
 * prices saved in the market_price table.
 *
 * Expected answer: a JSON array (or { data: [...] }) with items
 *   { "product": "papa criolla", "marketPrice": 4000, "middlemanPrice": 1300, "unit": "kg" }
 * snake_case names (market_price, middleman_price) are accepted too. If the real source uses
 * other field names, only toMarketPrice() needs to change.
 */
export class MarketPriceRestClient extends MarketPriceProvider {
  /**
   * @param {object} options
   * @param {string} options.url
   * @param {number} [options.timeoutMs]
   * @param {string} [options.token] sent as "Authorization: Bearer <token>" if the API needs it
   * @param {typeof fetch} [options.fetchFn]
   */
  constructor({ url, timeoutMs = 4000, token = null, fetchFn = fetch }) {
    super();
    if (!url) throw new Error('MarketPriceRestClient needs a URL');
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.token = token;
    this.fetchFn = fetchFn;
  }

  get name() {
    return `REST ${new URL(this.url).host}`;
  }

  async fetchAll() {
    const response = await this.fetchFn(this.url, {
      headers: { Accept: 'application/json', ...(this.token && { Authorization: `Bearer ${this.token}` }) },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Market price API answered ${response.status}`);
    const body = await response.json();
    const items = Array.isArray(body) ? body : body?.data;
    if (!Array.isArray(items)) throw new Error('Market price API: unexpected answer (no array)');

    const prices = [];
    for (const item of items) {
      try {
        prices.push(this.toMarketPrice(item));
      } catch { /* an invalid row is skipped, the rest are used */ }
    }
    if (prices.length === 0) throw new Error('Market price API: no valid prices');
    return prices;
  }

  /** Maps one item of the external API to the model. */
  toMarketPrice(item) {
    return new MarketPrice({
      product: item.product,
      marketPrice: item.marketPrice ?? item.market_price,
      middlemanPrice: item.middlemanPrice ?? item.middleman_price,
      unit: item.unit,
      source: this.name,
    });
  }
}
