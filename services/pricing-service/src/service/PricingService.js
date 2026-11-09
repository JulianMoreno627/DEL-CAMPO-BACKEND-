import { DomainError } from '@del-campo/shared';
import { FairPriceCalculator, MarketPercentageStrategy } from '../model/FairPrice.js';

/**
 * Fair price against market references.
 * Prices are kept in a cache (CACHE_TTL) and refreshed in the background:
 *   1. from the external REST source (if configured), saving them in market_price;
 *   2. if it is not configured or fails, from the market_price table (last known prices).
 * A failure of the external API never breaks the catalog: the last prices are used.
 */
export class PricingService {
  /**
   * @param {object} deps
   * @param {object} deps.priceRepo InMemory/PostgresMarketPriceRepository
   * @param {import('../clients/MarketPriceProvider.js').MarketPriceProvider|null} [deps.provider]
   * @param {import('../model/FairPrice.js').FairPriceStrategy} [deps.strategy]
   * @param {number} [deps.cacheTtlMs]
   * @param {object} [deps.log]
   */
  constructor({ priceRepo, provider = null, strategy = new MarketPercentageStrategy(), cacheTtlMs = 6 * 3_600_000, log = console }) {
    this.priceRepo = priceRepo;
    this.provider = provider;
    this.calculator = new FairPriceCalculator(new Map(), strategy);
    this.cacheTtlMs = cacheTtlMs;
    this.log = log;
    this.loadedAt = 0;
    this.lastSource = null;
    this.refreshing = null;
  }

  /** Loads the prices (REST source → table). Concurrent calls share the same refresh. */
  refresh() {
    this.refreshing ??= this.#load().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async #load() {
    if (this.provider) {
      try {
        const prices = await this.provider.fetchAll();
        await this.priceRepo.saveAll(prices);
        this.#use(prices, this.provider.name);
        return;
      } catch (error) {
        this.log.warn?.(`[pricing] external source failed (${error.message}); using saved prices`);
      }
    }
    this.#use(await this.priceRepo.findAll(), 'market_price');
  }

  #use(prices, source) {
    this.calculator.marketPrices = new Map(prices.map((p) => [p.product, p]));
    this.loadedAt = Date.now();
    this.lastSource = source;
  }

  /** First load waits; afterwards an expired cache is refreshed in the background (stale-while-revalidate). */
  async #ensureLoaded() {
    if (this.loadedAt === 0) return this.refresh();
    if (Date.now() - this.loadedAt > this.cacheTtlMs) this.refresh().catch(() => {});
  }

  async reference(product) {
    await this.#ensureLoaded();
    const reference = this.calculator.reference(product);
    if (!reference) throw new DomainError('Sin precio de referencia para ese producto', 404);
    return reference;
  }

  /**
   * @param {{product: string, price: number}[]} items
   * @returns {Promise<{evaluation: string, reference: object|null}[]>} same order as items
   */
  async evaluate(items) {
    await this.#ensureLoaded();
    return items.map(({ product, price }) => ({
      evaluation: this.calculator.evaluate(product, price),
      reference: this.calculator.reference(product),
    }));
  }
}
