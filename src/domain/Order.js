import { Entity } from './Entity.js';
import { DomainError, InvalidTransition } from './errors.js';

export const OrderStatus = Object.freeze({
  PENDING: 'PENDING',       // the buyer set aside part of a harvest
  CONFIRMED: 'CONFIRMED',   // the producer accepted
  DELIVERED: 'DELIVERED',   // product delivered and paid
  CANCELLED: 'CANCELLED',
});

const TRANSITIONS = Object.freeze({
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
});

/** Batch order: reservation of part of a harvest, with the price frozen when ordering. */
export class Order extends Entity {
  constructor({ harvestId, producerId, buyerId, quantity, unitPrice, status = OrderStatus.PENDING, ...base }) {
    super(base);
    if (!harvestId || !producerId || !buyerId) throw new DomainError('Reserva incompleta');
    if (!(Number(quantity) > 0)) throw new DomainError('La cantidad debe ser positiva');
    this.harvestId = harvestId;
    this.producerId = producerId;
    this.buyerId = buyerId;
    this.quantity = Number(quantity);
    this.unitPrice = Number(unitPrice);
    this.status = status;
  }

  get total() {
    return this.quantity * this.unitPrice;
  }

  /** Only completed orders allow both parties to rate each other. */
  get completed() {
    return this.status === OrderStatus.DELIVERED;
  }

  changeStatus(next) {
    if (!TRANSITIONS[this.status]?.includes(next)) throw new InvalidTransition(this.status, next);
    this.status = next;
    this.touch();
  }

  toJSON() {
    return {
      ...super.toJSON(),
      harvestId: this.harvestId,
      producerId: this.producerId,
      buyerId: this.buyerId,
      quantity: this.quantity,
      unitPrice: this.unitPrice,
      total: this.total,
      status: this.status,
    };
  }
}
