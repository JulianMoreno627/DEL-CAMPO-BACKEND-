import { NotFound } from '@del-campo/shared';
import { createContainer } from '../src/container.js';

/** Test double of order-service: orders as the Order message carries them. */
export class FakeOrderClient {
  constructor() {
    this.orders = new Map([
      ['o-delivered', { id: 'o-delivered', buyerId: 'c-ana', producerId: 'p-rosa', status: 'DELIVERED', completed: true }],
      ['o-pending', { id: 'o-pending', buyerId: 'c-ana', producerId: 'p-rosa', status: 'PENDING', completed: false }],
    ]);
  }

  async getOrder(id) {
    const order = this.orders.get(id);
    if (!order) throw new NotFound('Reserva');
    return order;
  }
}

/** Test double of user-service: Producer and Buyer criteria. */
export class FakeUserClient {
  async ratingCriteriaOf(userId) {
    return userId.startsWith('p-') ? ['quality', 'reliability'] : ['paysOnTime', 'seriousness'];
  }
}

export const createTestContainer = () =>
  createContainer({ clients: { orderClient: new FakeOrderClient(), userClient: new FakeUserClient() } });
