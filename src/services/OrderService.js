import { Order, OrderStatus } from '../domain/Order.js';
import { DomainError } from '../domain/errors.js';
import { EventBus } from './EventBus.js';

export class OrderService {
  constructor({ orderRepo, harvestRepo, userRepo, bus }) {
    this.orderRepo = orderRepo;
    this.harvestRepo = harvestRepo;
    this.userRepo = userRepo;
    this.bus = bus;
  }

  async create({ harvestId, buyerId, quantity }) {
    const buyer = await this.userRepo.getOrFail(buyerId);
    if (buyer.role !== 'BUYER') throw new DomainError('Solo un comprador puede reservar', 403);
    const harvest = await this.harvestRepo.getOrFail(harvestId);
    const readVersion = harvest.version;

    harvest.reserve(quantity);
    // If another buyer ordered between the read and the write, the repository throws VersionConflict (409)
    await this.harvestRepo.save(harvest, { expectedVersion: readVersion });

    const order = new Order({
      harvestId, buyerId, producerId: harvest.producerId, quantity, unitPrice: harvest.unitPrice,
    });
    await this.orderRepo.save(order);
    this.bus.emit(EventBus.HARVEST_CHANGED, harvest);
    this.bus.emit(EventBus.ORDER_CHANGED, order);
    return order;
  }

  /** List enriched with product and names, so the client does not need N extra requests. */
  async list({ buyerId, producerId } = {}) {
    const orders = await this.orderRepo.list((o) =>
      (!buyerId || o.buyerId === buyerId) && (!producerId || o.producerId === producerId));
    const names = new Map((await this.userRepo.list()).map((u) => [u.id, u.name]));
    const harvests = new Map((await this.harvestRepo.list()).map((h) => [h.id, h]));
    return orders
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((o) => ({
        ...o.toJSON(),
        product: harvests.get(o.harvestId)?.product,
        unit: harvests.get(o.harvestId)?.unit,
        availableOn: harvests.get(o.harvestId)?.availableOn,
        producerName: names.get(o.producerId),
        buyerName: names.get(o.buyerId),
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
    if (newStatus === OrderStatus.CANCELLED) {
      const harvest = await this.harvestRepo.getOrFail(order.harvestId);
      harvest.release(order.quantity);
      await this.harvestRepo.save(harvest);
      this.bus.emit(EventBus.HARVEST_CHANGED, harvest);
    }
    await this.orderRepo.save(order);
    this.bus.emit(EventBus.ORDER_CHANGED, order);
    return order;
  }
}
