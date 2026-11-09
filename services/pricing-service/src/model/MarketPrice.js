import { DomainError } from '@del-campo/shared';

/**
 * Market reference of a product: average consumer price in the city and what a middleman
 * typically pays at the farm (COP per kg or unit), plus where the data came from.
 */
export class MarketPrice {
  constructor({ product, marketPrice, middlemanPrice, unit, source = 'DESCONOCIDA', updatedAt = new Date().toISOString() }) {
    if (!String(product ?? '').trim()) throw new DomainError('El producto es obligatorio');
    if (!(Number(marketPrice) > 0)) throw new DomainError('El precio de mercado debe ser positivo');
    if (!(Number(middlemanPrice) >= 0)) throw new DomainError('El precio del intermediario no es válido');
    this.product = String(product).trim().toLowerCase();
    this.marketPrice = Number(marketPrice);
    this.middlemanPrice = Number(middlemanPrice);
    this.unit = unit || 'kg';
    this.source = source;
    this.updatedAt = updatedAt;
  }
}
