import { InMemoryRepository, PostgresRepository } from '@del-campo/shared';
import { Order } from '../model/Order.js';

const factory = (data) => new Order(data);

/** Orders in memory (development and tests). */
export class InMemoryOrderRepository extends InMemoryRepository {
  constructor() {
    super('Reserva', factory);
  }
}

/** Table purchase_order (owned by order-service). The total is computed, it is not stored. */
export class PostgresOrderRepository extends PostgresRepository {
  constructor({ pool }) {
    super({ pool, table: 'purchase_order', resourceName: 'Reserva', factory, exclude: ['total'] });
  }
}
