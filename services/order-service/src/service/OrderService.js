import { DomainError } from '@del-campo/shared';
import { Order, OrderStatus } from '../model/Order.js';
import { EventBus } from '../model/EventBus.js';

/** Orders: direct creation, enriched lists, life cycle and queries used by other services. */
export class OrderService {
  /**
   * @param {object} deps
   * @param {import('@del-campo/shared').Repository} deps.orderRepo
   * @param {import('../clients/CatalogClient.js').CatalogClient} deps.catalogClient
   * @param {import('../clients/UserClient.js').UserClient} deps.userClient
   * @param {EventBus} deps.bus
   */
  constructor({ orderRepo, catalogClient, userClient, bus, log = console }) {
    this.orderRepo = orderRepo;
    this.catalogClient = catalogClient;
    this.userClient = userClient;
    this.bus = bus;
    this.log = log;
  }

  async assertBuyer(buyerId) {
    const buyer = await this.userClient.getUser(buyerId);
    if (buyer.role !== 'BUYER') throw new DomainError('Solo un comprador puede reservar', 403);
  }

  /** One order outside the cart: reserves in catalog-service and freezes the price. */
  async create({ harvestId, buyerId, quantity }) {
    await this.assertBuyer(buyerId);
    const harvest = await this.catalogClient.reserve(harvestId, quantity);
    const order = new Order({ harvestId, buyerId, producerId: harvest.producerId, quantity, unitPrice: harvest.unitPrice });
    try {
      await this.orderRepo.save(order);
    } catch (error) {
      // Compensation: the reservation must not stay without its order
      await this.catalogClient.release(harvestId, quantity).catch((releaseError) =>
        this.log.error(`[order] could not release ${quantity} of ${harvestId}: ${releaseError.message}`));
      throw error;
    }
    this.bus.emit(EventBus.ORDER_CHANGED, order);
    return order;
  }

  /** List enriched with product and names, so the client does not need N extra requests. */
  async list({ buyerId, producerId } = {}) {
    const orders = await this.orderRepo.list((o) =>
      (!buyerId || o.buyerId === buyerId) && (!producerId || o.producerId === producerId));
    const userIds = [...new Set(orders.flatMap((o) => [o.producerId, o.buyerId]))];
    const harvestIds = [...new Set(orders.map((o) => o.harvestId))];
    const [users, harvestList] = await Promise.all([
      this.userClient.getUsersByIds(userIds),
      this.catalogClient.getHarvestsByIds(harvestIds),
    ]);
    const names = new Map(users.map((u) => [u.id, u.name]));
    const harvests = new Map(harvestList.map((h) => [h.id, h]));
    return orders
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((order) => ({
        order,
        product: harvests.get(order.harvestId)?.product,
        unit: harvests.get(order.harvestId)?.unit,
        availableOn: harvests.get(order.harvestId)?.availableOn,
        producerName: names.get(order.producerId),
        buyerName: names.get(order.buyerId),
      }));
  }

  /** Rules: the producer confirms and delivers; either party can cancel. */
  async changeStatus(id, newStatus, userId) {
    const order = await this.orderRepo.getOrFail(id);
    const isProducer = userId === order.producerId;
    const isBuyer = userId === order.buyerId;
    if (!isProducer && !isBuyer) throw new DomainError('No participa en esta reserva', 403);
    if ([OrderStatus.CONFIRMED, OrderStatus.DELIVERED].includes(newStatus) && !isProducer) {
      throw new DomainError('Solo el productor puede confirmar o entregar', 403);
    }

    order.changeStatus(newStatus);
    if (newStatus === OrderStatus.CANCELLED) await this.catalogClient.release(order.harvestId, order.quantity);
    await this.orderRepo.save(order);
    this.bus.emit(EventBus.ORDER_CHANGED, order);
    return order;
  }

  getOrder(id) {
    return this.orderRepo.getOrFail(id);
  }

  /** Any order counts (also cancelled ones): they are kept as history. */
  async hasOrdersForHarvest(harvestId) {
    return (await this.orderRepo.list((o) => o.harvestId === harvestId)).length > 0;
  }
}
