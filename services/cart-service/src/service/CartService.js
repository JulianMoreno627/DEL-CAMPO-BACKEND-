import { DomainError } from '@del-campo/shared';
import { Cart } from '../model/Cart.js';

/**
 * Buyer's cart. The checkout (turning it into orders) is the saga that order-service orchestrates;
 * here there are only the cart operations and the two internal ones it uses (items and empty).
 */
export class CartService {
  /**
   * @param {object} deps
   * @param {import('@del-campo/shared').Repository} deps.cartRepo
   * @param {import('../clients/CatalogClient.js').CatalogClient} deps.catalogClient
   */
  constructor({ cartRepo, catalogClient }) {
    this.cartRepo = cartRepo;
    this.catalogClient = catalogClient;
  }

  /** Cart with the current price, subtotal per product and total. */
  async view(buyerId) {
    const cart = await this.#cartOf(buyerId);
    const ids = [...new Set(cart.items.map((item) => item.listingId))];
    const listings = new Map((await this.catalogClient.getHarvestsByIds(ids)).map((h) => [h.id, h]));

    const items = cart.items.map(({ listingId, quantity }) => {
      const listing = listings.get(listingId);
      if (!listing) return { listingId, quantity, product: null, available: false, subtotal: 0 };
      return {
        listingId,
        quantity,
        product: listing.product,
        photo: listing.photo ?? null,
        unit: listing.unit,
        price: listing.unitPrice,
        subtotal: listing.unitPrice * quantity,
        availableQuantity: listing.freeQuantity,
        available: listing.acceptsReservations && quantity <= listing.freeQuantity,
      };
    });
    return { items, total: items.reduce((sum, item) => sum + item.subtotal, 0) };
  }

  async add(buyerId, listingId, quantity) {
    const cart = await this.#cartOf(buyerId);
    const listing = await this.catalogClient.getHarvest(listingId);
    checkStock(listing, cart.quantityOf(listingId) + Number(quantity));
    cart.add(listingId, quantity);
    await this.cartRepo.save(cart);
    return this.view(buyerId);
  }

  async changeQuantity(buyerId, listingId, quantity) {
    const cart = await this.#cartOf(buyerId);
    if (Number(quantity) > 0) checkStock(await this.catalogClient.getHarvest(listingId), Number(quantity));
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
    await this.empty(buyerId);
    return this.view(buyerId);
  }

  // ---- Internal operations of the checkout saga

  /** @returns {Promise<{listingId: string, quantity: number}[]>} */
  async items(buyerId) {
    return (await this.#cartOf(buyerId)).items;
  }

  async empty(buyerId) {
    const cart = await this.#cartOf(buyerId);
    cart.clear();
    await this.cartRepo.save(cart);
  }

  async #cartOf(buyerId) {
    return (await this.cartRepo.get(buyerId)) ?? new Cart({ buyerId });
  }
}

function checkStock(listing, quantity) {
  if (!listing.acceptsReservations) throw new DomainError(`${listing.product} ya no está disponible`, 409);
  if (quantity > listing.freeQuantity) {
    throw new DomainError(`Solo quedan ${listing.freeQuantity} ${listing.unit} de ${listing.product}`, 409);
  }
}
