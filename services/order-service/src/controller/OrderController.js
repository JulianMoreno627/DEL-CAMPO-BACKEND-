import { toOrderDto, toOrderDetailDto, toCheckoutDto } from '../dto/orderDto.js';

/** Receives DTOs (and who is acting), calls the services and returns DTOs (no gRPC details). */
export class OrderController {
  constructor({ orderService, checkoutSaga }) {
    this.orderService = orderService;
    this.checkoutSaga = checkoutSaga;
  }

  async checkoutCart(buyerId) {
    return toCheckoutDto(await this.checkoutSaga.run(buyerId));
  }

  async createOrder(buyerId, { harvestId, quantity }) {
    return toOrderDto(await this.orderService.create({ harvestId, buyerId, quantity }));
  }

  /** A producer sees the orders they received; a buyer, the ones they placed. */
  async listOrders(userId, role) {
    const filter = role === 'PRODUCER' ? { producerId: userId } : { buyerId: userId };
    return (await this.orderService.list(filter)).map(toOrderDetailDto);
  }

  async changeOrderStatus(id, status, userId) {
    return toOrderDto(await this.orderService.changeStatus(id, status, userId));
  }

  async getOrder(id) {
    return toOrderDto(await this.orderService.getOrder(id));
  }

  async hasOrdersForHarvest(harvestId) {
    return this.orderService.hasOrdersForHarvest(harvestId);
  }
}
