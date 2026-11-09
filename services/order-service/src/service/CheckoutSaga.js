import { DomainError, currentContext } from '@del-campo/shared';
import { setTimeout as sleep } from 'node:timers/promises';
import { Order } from '../model/Order.js';
import { EventBus } from '../model/EventBus.js';

/**
 * Checkout saga (orchestrated by order-service): turns the cart into orders, "all or nothing".
 *
 *   1. cart-service      GetCartItems  → what the buyer wants
 *   2. catalog-service   ReserveHarvest → for each product (price frozen in the order)
 *   3. order-service     saves each order (its own table)
 *   4. cart-service      EmptyCart
 *
 * If any step fails, the completed steps are COMPENSATED in reverse order: the created orders are
 * deleted and the reserved quantity is released. The cart is left untouched and the original
 * error reaches the buyer. Without distributed transactions this is not atomic: if a compensation
 * also fails (catalog-service down), it is retried and, if it still fails, it is logged with the
 * request id so it can be fixed by hand.
 */
export class CheckoutSaga {
  static COMPENSATION_ATTEMPTS = 3;

  /**
   * @param {object} deps
   * @param {import('@del-campo/shared').Repository} deps.orderRepo
   * @param {import('../clients/CartClient.js').CartClient} deps.cartClient
   * @param {import('../clients/CatalogClient.js').CatalogClient} deps.catalogClient
   * @param {import('./OrderService.js').OrderService} deps.orderService
   * @param {EventBus} deps.bus
   */
  constructor({ orderRepo, cartClient, catalogClient, orderService, bus, log = console, retryDelayMs = 200 }) {
    this.orderRepo = orderRepo;
    this.cartClient = cartClient;
    this.catalogClient = catalogClient;
    this.orderService = orderService;
    this.bus = bus;
    this.log = log;
    this.retryDelayMs = retryDelayMs;
  }

  /** @returns {Promise<{ orders: Order[], total: number }>} */
  async run(buyerId) {
    const items = await this.cartClient.items(buyerId);
    if (items.length === 0) throw new DomainError('El carrito está vacío');
    await this.orderService.assertBuyer(buyerId);

    const completed = []; // { harvestId, quantity, order? } in the order they happened
    try {
      for (const { listingId, quantity } of items) {
        const harvest = await this.catalogClient.reserve(listingId, quantity);
        const step = { harvestId: listingId, quantity, order: null };
        completed.push(step);
        const order = new Order({
          harvestId: listingId, buyerId, producerId: harvest.producerId, quantity, unitPrice: harvest.unitPrice,
        });
        await this.orderRepo.save(order);
        step.order = order;
      }
      await this.cartClient.empty(buyerId);
    } catch (error) {
      await this.#compensate(completed);
      throw error;
    }

    const orders = completed.map((step) => step.order);
    for (const order of orders) this.bus.emit(EventBus.ORDER_CHANGED, order);
    return { orders, total: orders.reduce((sum, order) => sum + order.total, 0) };
  }

  async #compensate(completed) {
    for (const { harvestId, quantity, order } of [...completed].reverse()) {
      if (order) await this.#retry(`delete order ${order.id}`, () => this.orderRepo.delete(order.id));
      await this.#retry(`release ${quantity} of ${harvestId}`, () => this.catalogClient.release(harvestId, quantity));
    }
  }

  async #retry(description, action) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await action();
      } catch (error) {
        if (attempt >= CheckoutSaga.COMPENSATION_ATTEMPTS) {
          this.log.error(`[order] saga compensation failed (${description}) request=${currentContext().requestId ?? '-'}: ${error.message}`);
          return undefined;
        }
        await sleep(this.retryDelayMs * attempt);
      }
    }
  }
}
