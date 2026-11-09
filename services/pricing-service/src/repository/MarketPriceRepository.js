import { MarketPrice } from '../model/MarketPrice.js';

/** Market prices in memory (development and tests). */
export class InMemoryMarketPriceRepository {
  #rows = new Map();

  async findAll() {
    return [...this.#rows.values()];
  }

  async saveAll(prices) {
    for (const price of prices) this.#rows.set(price.product, price);
  }
}

/** Table market_price (owned by pricing-service): last known prices, used as fallback. */
export class PostgresMarketPriceRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async findAll() {
    const { rows } = await this.pool.query(
      'SELECT product, market_price, middleman_price, unit, source, updated_at FROM market_price');
    return rows.map((row) => new MarketPrice({
      product: row.product,
      marketPrice: row.market_price,
      middlemanPrice: row.middleman_price,
      unit: row.unit,
      source: row.source,
      updatedAt: row.updated_at,
    }));
  }

  async saveAll(prices) {
    for (const p of prices) {
      await this.pool.query(
        `INSERT INTO market_price (product, market_price, middleman_price, unit, source, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (product) DO UPDATE SET market_price = EXCLUDED.market_price,
           middleman_price = EXCLUDED.middleman_price, unit = EXCLUDED.unit,
           source = EXCLUDED.source, updated_at = EXCLUDED.updated_at`,
        [p.product, p.marketPrice, p.middlemanPrice, p.unit, p.source, p.updatedAt]);
    }
  }
}
