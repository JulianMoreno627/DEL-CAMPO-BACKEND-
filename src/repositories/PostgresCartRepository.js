import { PostgresRepository } from './PostgresRepository.js';
import { Cart } from '../domain/Cart.js';

/**
 * Cart repository backed by Postgres.
 * The cart's primary key is the buyer's id (buyer_id), and items are stored as JSONB.
 */
export class PostgresCartRepository extends PostgresRepository {
  constructor({ pool }) {
    super({
      pool,
      table: 'cart',
      resourceName: 'Carrito',
      factory: (data) => new Cart(data),
      primaryKey: 'buyer_id',
    });
  }

  fromRow(row) {
    return new Cart({
      buyerId: row.buyer_id,
      items: row.items ?? [],
      version: row.version,
      updatedAt: row.updated_at,
    });
  }

  toRow(entity) {
    const obj = entity.toJSON();
    return {
      columns: ['buyer_id', 'items', 'version', 'updated_at'],
      values: [obj.buyerId, JSON.stringify(obj.items), obj.version, obj.updatedAt],
    };
  }
}
