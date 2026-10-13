import { DomainError } from './errors.js';

/**
 * Strategy pattern: the way the "fair price" is calculated can change
 * (percentage of the market price, production cost + margin, etc.)
 * without modifying the service that uses it.
 */
export class FairPriceStrategy {
  /** @returns {{ min: number, max: number }} */
  range(_marketPrice) {
    throw new Error('Abstract strategy: implement range()');
  }
}

/**
 * Suggested range as a fraction of the average consumer price in the city.
 * Defaults to 60 %–85 %: the producer earns more than what a middleman pays
 * (~30 %–40 %) and the buyer pays less than in a store.
 */
export class MarketPercentageStrategy extends FairPriceStrategy {
  constructor({ min = 0.6, max = 0.85 } = {}) {
    super();
    if (!(min > 0 && min < max)) throw new DomainError('Porcentajes de precio inválidos');
    this.min = min;
    this.max = max;
  }

  range(marketPrice) {
    return {
      min: Math.round(marketPrice * this.min),
      max: Math.round(marketPrice * this.max),
    };
  }
}

/** Calculates and evaluates a product's price against the market reference. */
export class FairPriceCalculator {
  /**
   * @param {Map<string, {marketPrice:number, middlemanPrice:number, unit:string}>} marketPrices
   * @param {FairPriceStrategy} strategy
   */
  constructor(marketPrices, strategy = new MarketPercentageStrategy()) {
    this.marketPrices = marketPrices;
    this.strategy = strategy;
  }

  reference(product) {
    const market = this.marketPrices.get(product.toLowerCase());
    if (!market) return null;
    return { product, ...market, fairRange: this.strategy.range(market.marketPrice) };
  }

  /** @returns {'LOW'|'FAIR'|'HIGH'|'NO_REFERENCE'} */
  evaluate(product, price) {
    const reference = this.reference(product);
    if (!reference) return 'NO_REFERENCE';
    if (price < reference.fairRange.min) return 'LOW';
    if (price > reference.fairRange.max) return 'HIGH';
    return 'FAIR';
  }
}
