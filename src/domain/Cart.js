import { Entity } from './Entity.js';
import { DomainError, NotFound } from './errors.js';

/**
 * Buyer's shopping cart: one cart per buyer (its id is the buyer's id).
 * It only stores which listings and how many units; the price is read from the listing
 * when it is shown and gets frozen in the order at checkout.
 */
export class Cart extends Entity {
  constructor({ buyerId, items = [], ...base }) {
    super({ ...base, id: buyerId });
    if (!buyerId) throw new DomainError('El carrito debe pertenecer a un comprador');
    this.buyerId = buyerId;
    this.items = items.map(({ listingId, quantity }) => ({ listingId, quantity: Number(quantity) }));
  }

  get isEmpty() {
    return this.items.length === 0;
  }

  quantityOf(listingId) {
    return this.items.find((item) => item.listingId === listingId)?.quantity ?? 0;
  }

  add(listingId, quantity) {
    quantity = validQuantity(quantity);
    const item = this.items.find((i) => i.listingId === listingId);
    if (item) item.quantity += quantity;
    else this.items.push({ listingId, quantity });
    this.touch();
  }

  /** Changes the quantity of a product; 0 removes it from the cart. */
  changeQuantity(listingId, quantity) {
    if (Number(quantity) === 0) return this.remove(listingId);
    const item = this.items.find((i) => i.listingId === listingId);
    if (!item) throw new NotFound('Producto en el carrito');
    item.quantity = validQuantity(quantity);
    this.touch();
  }

  remove(listingId) {
    this.items = this.items.filter((item) => item.listingId !== listingId);
    this.touch();
  }

  clear() {
    this.items = [];
    this.touch();
  }

  toJSON() {
    return { ...super.toJSON(), buyerId: this.buyerId, items: this.items };
  }
}

function validQuantity(value) {
  const quantity = Number(value);
  if (!(quantity > 0)) throw new DomainError('La cantidad debe ser positiva');
  return quantity;
}
