import { Entity } from './Entity.js';
import { Coordinate } from './Coordinate.js';
import { DomainError } from './errors.js';

/**
 * Abstract user. Producer and Buyer inherit from it and override (polymorphism)
 * the criteria the other party uses to rate them: this is how the two-way reputation works.
 */
export class User extends Entity {
  constructor({ name, phone = '', location = null, ...base }) {
    super(base);
    if (new.target === User) throw new TypeError('User is abstract');
    if (!name?.trim()) throw new DomainError('El nombre es obligatorio');
    this.name = name.trim();
    this.phone = phone;
    // Optional: whoever signs up from the app may not share their location
    this.location = location ? Coordinate.from(location) : null;
  }

  /** @returns {'PRODUCER'|'BUYER'} */
  get role() {
    throw new Error('Subclass must implement role');
  }

  /** Criteria (1–5) other users rate this user with. */
  ratingCriteria() {
    throw new Error('Subclass must implement ratingCriteria');
  }

  toJSON() {
    return {
      ...super.toJSON(),
      role: this.role,
      name: this.name,
      phone: this.phone,
      location: this.location,
    };
  }
}

export class Producer extends User {
  constructor({ farm, village = '', town = '', crops = [], ...rest }) {
    super(rest);
    this.farm = farm ?? `Finca de ${this.name}`;
    this.village = village;
    this.town = town;
    this.crops = crops;
  }

  get role() {
    return 'PRODUCER';
  }

  ratingCriteria() {
    return ['quality', 'reliability'];
  }

  toJSON() {
    return {
      ...super.toJSON(),
      farm: this.farm,
      village: this.village,
      town: this.town,
      crops: this.crops,
    };
  }
}

export class Buyer extends User {
  static TYPES = ['CONSUMER', 'STORE', 'RESTAURANT'];

  constructor({ type = 'CONSUMER', ...rest }) {
    super(rest);
    if (!Buyer.TYPES.includes(type)) throw new DomainError(`Tipo de comprador inválido: ${type}`);
    this.type = type;
  }

  get role() {
    return 'BUYER';
  }

  ratingCriteria() {
    return ['paysOnTime', 'seriousness'];
  }

  toJSON() {
    return { ...super.toJSON(), type: this.type };
  }
}

/** Factory: rebuilds the right subtype from plain data (repository / JSON). */
export function createUser(data) {
  switch (data.role) {
    case 'PRODUCER': return new Producer(data);
    case 'BUYER': return new Buyer(data);
    default: throw new DomainError(`Rol desconocido: ${data.role}`);
  }
}
