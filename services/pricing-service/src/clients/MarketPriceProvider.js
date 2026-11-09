/**
 * Source of market prices (interface). The service depends on this abstraction,
 * so the REST client can be replaced (another source, a fake in the tests) without touching it.
 */
export class MarketPriceProvider {
  /** Human-readable name of the source (stored in market_price.source). */
  get name() {
    throw new Error('Abstract provider: implement name');
  }

  /** @returns {Promise<import('../model/MarketPrice.js').MarketPrice[]>} */
  async fetchAll() {
    throw new Error('Abstract provider: implement fetchAll()');
  }
}
