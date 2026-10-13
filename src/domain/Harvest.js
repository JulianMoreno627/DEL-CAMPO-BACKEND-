import { Entity } from './Entity.js';
import { DomainError, InvalidTransition } from './errors.js';

export const HarvestStatus = Object.freeze({
  PLANTED: 'PLANTED',
  GROWING: 'GROWING',
  AVAILABLE: 'AVAILABLE',
  SOLD_OUT: 'SOLD_OUT',
});

/** State machine: planted → growing → available → sold out. */
const TRANSITIONS = Object.freeze({
  PLANTED: ['GROWING'],
  GROWING: ['AVAILABLE'],
  AVAILABLE: ['SOLD_OUT'],
  SOLD_OUT: [],
});

/** Fields the producer can edit (also from offline mode). */
const EDITABLE_FIELDS = ['product', 'estimatedQuantity', 'unitPrice', 'availableOn', 'description', 'photo', 'status'];

/**
 * A harvest is NOT a fixed stock: it is a future production with an estimated date
 * that accepts advance reservations while it is not sold out.
 * A producer's listing is stored as a harvest.
 */
export class Harvest extends Entity {
  #status;

  constructor({
    producerId, product, category = 'other', unit = 'kg',
    estimatedQuantity, reservedQuantity = 0, unitPrice,
    plantedOn = null, availableOn, description = '', photo = null,
    status = HarvestStatus.PLANTED, fieldTimestamps = {}, ...base
  }) {
    super(base);
    if (!producerId) throw new DomainError('La cosecha debe pertenecer a un productor');
    if (!product?.trim()) throw new DomainError('El producto es obligatorio');
    if (!HarvestStatus[status]) throw new DomainError(`Estado inválido: ${status}`);
    this.producerId = producerId;
    this.product = product.trim();
    this.category = category;
    this.unit = unit;
    this.reservedQuantity = Number(reservedQuantity);
    this.#setEstimatedQuantity(estimatedQuantity);
    this.#setPrice(unitPrice);
    this.#setAvailableOn(availableOn);
    this.plantedOn = plantedOn;
    this.description = description;
    this.photo = photo;
    this.#status = status;
    // Timestamp of the last write of each field (per-field Last-Writer-Wins conflict resolution)
    this.fieldTimestamps = { ...fieldTimestamps };
  }

  get status() {
    return this.#status;
  }

  get freeQuantity() {
    return this.estimatedQuantity - this.reservedQuantity;
  }

  acceptsReservations() {
    return this.#status !== HarvestStatus.SOLD_OUT && this.freeQuantity > 0;
  }

  canAdvanceTo(newStatus) {
    return TRANSITIONS[this.#status].includes(newStatus);
  }

  advanceTo(newStatus) {
    if (!this.canAdvanceTo(newStatus)) throw new InvalidTransition(this.#status, newStatus);
    this.#status = newStatus;
    this.touch();
  }

  /** Advance reservation of part of the harvest. */
  reserve(quantity) {
    quantity = Number(quantity);
    if (!(quantity > 0)) throw new DomainError('La cantidad a reservar debe ser positiva');
    if (!this.acceptsReservations()) throw new DomainError('Esta cosecha ya no admite reservas', 409);
    if (quantity > this.freeQuantity) {
      throw new DomainError(`Solo quedan ${this.freeQuantity} ${this.unit} libres`, 409);
    }
    this.reservedQuantity += quantity;
    if (this.freeQuantity === 0 && this.#status === HarvestStatus.AVAILABLE) {
      this.#status = HarvestStatus.SOLD_OUT;
    }
    this.touch();
  }

  /** Gives back reserved quantity (e.g. when an order is cancelled or a purchase is rolled back). */
  release(quantity) {
    const soldOutByReservations = this.#status === HarvestStatus.SOLD_OUT && this.freeQuantity === 0;
    this.reservedQuantity = Math.max(0, this.reservedQuantity - Number(quantity));
    // If it sold out only because of reservations, releasing quantity puts it back on sale
    if (soldOutByReservations && this.freeQuantity > 0) this.#status = HarvestStatus.AVAILABLE;
    this.touch();
  }

  /**
   * Applies changes with per-field "Last-Writer-Wins" conflict resolution:
   * a field is only overwritten if the change is newer than the last recorded
   * write of that field. It is atomic: if one value is invalid nothing is applied.
   * @returns {{ applied: string[], conflicts: string[] }}
   */
  applyChanges(changes, timestamp = new Date().toISOString()) {
    const applied = [];
    const conflicts = [];
    const backup = this.#snapshot();
    try {
      // 'status' is applied last so it is validated against the already updated quantity
      const fields = Object.keys(changes)
        .filter((field) => EDITABLE_FIELDS.includes(field))
        .sort((a, b) => (a === 'status') - (b === 'status'));
      for (const field of fields) {
        const lastWrite = this.fieldTimestamps[field];
        if (lastWrite && lastWrite > timestamp) {
          conflicts.push(field);
          continue;
        }
        this.#assign(field, changes[field]);
        this.fieldTimestamps[field] = timestamp;
        applied.push(field);
      }
    } catch (error) {
      this.#restore(backup);
      throw error;
    }
    if (applied.length) this.touch();
    return { applied, conflicts };
  }

  #assign(field, value) {
    switch (field) {
      case 'estimatedQuantity': return this.#setEstimatedQuantity(value);
      case 'unitPrice': return this.#setPrice(value);
      case 'availableOn': return this.#setAvailableOn(value);
      case 'product':
        if (!String(value ?? '').trim()) throw new DomainError('El producto es obligatorio');
        this.product = String(value).trim();
        return;
      case 'status':
        if (value === this.#status) return;
        if (!this.canAdvanceTo(value)) throw new InvalidTransition(this.#status, value);
        this.#status = value;
        return;
      default:
        this[field] = value;
    }
  }

  #setEstimatedQuantity(value) {
    const quantity = Number(value);
    if (!(quantity > 0)) throw new DomainError('La cantidad estimada debe ser positiva');
    if (quantity < this.reservedQuantity) {
      throw new DomainError(`Ya hay ${this.reservedQuantity} ${this.unit ?? ''} reservados; no puede estimar menos`, 409);
    }
    this.estimatedQuantity = quantity;
  }

  #setPrice(value) {
    const price = Number(value);
    if (!(price > 0)) throw new DomainError('El precio debe ser positivo');
    this.unitPrice = price;
  }

  #setAvailableOn(value) {
    if (!value || Number.isNaN(Date.parse(value))) throw new DomainError('Fecha de disponibilidad inválida');
    this.availableOn = String(value).slice(0, 10);
  }

  #snapshot() {
    return { ...this.toJSON(), fieldTimestamps: { ...this.fieldTimestamps } };
  }

  #restore(copy) {
    for (const field of EDITABLE_FIELDS) {
      if (field === 'status') this.#status = copy.status;
      else this[field] = copy[field];
    }
    this.fieldTimestamps = copy.fieldTimestamps;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      producerId: this.producerId,
      product: this.product,
      category: this.category,
      unit: this.unit,
      estimatedQuantity: this.estimatedQuantity,
      reservedQuantity: this.reservedQuantity,
      freeQuantity: this.freeQuantity,
      unitPrice: this.unitPrice,
      plantedOn: this.plantedOn,
      availableOn: this.availableOn,
      description: this.description,
      photo: this.photo,
      status: this.#status,
      fieldTimestamps: this.fieldTimestamps,
    };
  }
}
