import { Cart } from '../domain/Cart.js';
import { OrderStatus } from '../domain/Order.js';
import { DomainError } from '../domain/errors.js';

/**
 * Buyer's cart. At checkout every product becomes an order for its producer,
 * with the price frozen at that moment.
 */
export class CartService {
  constructor({ cartRepo, harvestRepo, orderRepo, orderService }) {
    this.cartRepo = cartRepo;
    this.harvestRepo = harvestRepo;
    this.orderRepo = orderRepo;
    this.orderService = orderService;
  }

  /** Cart with the current price, subtotal per product and total. */
  async view(buyerId) {
    const cart = await this.#cartOf(buyerId);
    const ids = new Set(cart.items.map((item) => item.listingId));
    const listings = new Map((await this.harvestRepo.list((h) => ids.has(h.id))).map((h) => [h.id, h]));

    const items = cart.items.map(({ listingId, quantity }) => {
      const listing = listings.get(listingId);
      if (!listing) return { listingId, quantity, product: null, available: false, subtotal: 0 };
      return {
        listingId,
        quantity,
        product: listing.product,
        photo: listing.photo,
        unit: listing.unit,
        price: listing.unitPrice,
        subtotal: listing.unitPrice * quantity,
        availableQuantity: listing.freeQuantity,
        available: listing.acceptsReservations() && quantity <= listing.freeQuantity,
      };
    });
    return { items, total: items.reduce((sum, item) => sum + item.subtotal, 0) };
  }

  async add(buyerId, listingId, quantity) {
    const cart = await this.#cartOf(buyerId);
    const listing = await this.harvestRepo.getOrFail(listingId);
    checkStock(listing, cart.quantityOf(listingId) + Number(quantity));
    cart.add(listingId, quantity);
    await this.cartRepo.save(cart);
    return this.view(buyerId);
  }

  async changeQuantity(buyerId, listingId, quantity) {
    const cart = await this.#cartOf(buyerId);
    if (Number(quantity) > 0) checkStock(await this.harvestRepo.getOrFail(listingId), Number(quantity));
    cart.changeQuantity(listingId, quantity);
    await this.cartRepo.save(cart);
    return this.view(buyerId);
  }

  async remove(buyerId, listingId) {
    const cart = await this.#cartOf(buyerId);
    cart.remove(listingId);
    await this.cartRepo.save(cart);
    return this.view(buyerId);
  }

  async clear(buyerId) {
    const cart = await this.#cartOf(buyerId);
    cart.clear();
    await this.cartRepo.save(cart);
    return this.view(buyerId);
  }

  /**
   * Turns the cart into orders. It is "all or nothing": if a product no longer has enough quantity,
   * the orders created in this checkout are rolled back and the cart stays untouched.
   */
  async checkout(buyerId) {
    const cart = await this.#cartOf(buyerId);
    if (cart.isEmpty) throw new DomainError('El carrito está vacío');

    const orders = [];
    try {
      for (const { listingId, quantity } of cart.items) {
        orders.push(await this.orderService.create({ harvestId: listingId, buyerId, quantity }));
      }
    } catch (error) {
      for (const order of orders) {
        await this.orderService.changeStatus(order.id, OrderStatus.CANCELLED, buyerId);
        await this.orderRepo.delete(order.id);
      }
      throw error;
    }

    cart.clear();
    await this.cartRepo.save(cart);
    return { orders, total: orders.reduce((sum, order) => sum + order.total, 0) };
  }

  async #cartOf(buyerId) {
    return (await this.cartRepo.get(buyerId)) ?? new Cart({ buyerId });
  }
}

function checkStock(listing, quantity) {
  if (!listing.acceptsReservations()) throw new DomainError(`${listing.product} ya no está disponible`, 409);
  if (quantity > listing.freeQuantity) {
    throw new DomainError(`Solo quedan ${listing.freeQuantity} ${listing.unit} de ${listing.product}`, 409);
  }
}
