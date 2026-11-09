import { InMemoryRepository, PostgresRepository } from '@del-campo/shared';
import { Cart } from '../model/Cart.js';

/** Carts in memory (development and tests). */
export class InMemoryCartRepository extends InMemoryRepository {
  constructor() {
    super('Carrito', (data) => new Cart(data));
  }
}

/**
 * Table cart (owned by cart-service): the primary key is the buyer's id and the items are JSONB.
 */
export class PostgresCartRepository extends PostgresRepository {
  constructor({ pool }) {
    super({ pool, table: 'cart', resourceName: 'Carrito', factory: (data) => new Cart(data), primaryKey: 'buyer_id' });
  }

  fromRow(row) {
    return new Cart({ buyerId: row.buyer_id, items: row.items ?? [], version: row.version, updatedAt: row.updated_at });
  }

  toRow(entity) {
    const cart = entity.toJSON();
    return {
      columns: ['buyer_id', 'items', 'version', 'updated_at'],
      values: [cart.buyerId, JSON.stringify(cart.items), cart.version, cart.updatedAt],
    };
  }
}
