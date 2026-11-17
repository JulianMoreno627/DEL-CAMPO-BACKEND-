import { Entity, DomainError } from '@del-campo/shared';
import { Coordinate } from './Coordinate.js';

const MAX_TEXT = 80;
const PHONE = /^[0-9+()\s-]{0,20}$/;

/**
 * Abstract user. Producer and Buyer inherit from it and override (polymorphism)
 * the criteria the other party uses to rate them (two-way reputation) and the
 * profile fields each one can edit.
 */
export class User extends Entity {
  constructor({ name, phone = '', location = null, avatar = null, ...base }) {
    super(base);
    if (new.target === User) throw new TypeError('User is abstract');
    if (!name?.trim()) throw new DomainError('El nombre es obligatorio');
    this.name = name.trim();
    this.phone = phone ?? '';
    // Optional: whoever signs up from the app may not share their location
    this.location = location ? Coordinate.from(location) : null;
    this.avatar = avatar; // public URL of the profile photo (/avatars/<file>) or null
  }

  /** @returns {'PRODUCER'|'BUYER'} */
  get role() {
    throw new Error('Subclass must implement role');
  }

  /** Criteria (1–5) other users rate this user with. */
  ratingCriteria() {
    throw new Error('Subclass must implement ratingCriteria');
  }

  /** Profile fields the user can edit; each subclass adds its own. */
  editableFields() {
    return ['name', 'phone'];
  }

  /**
   * Edits the profile. Only the fields of editableFields() that were sent are touched;
   * everything is validated before changing anything (all or nothing).
   * @returns {string[]} fields that changed
   */
  updateProfile(changes) {
    const values = {};
    for (const field of this.editableFields()) {
      if (changes[field] !== undefined) values[field] = this.validateField(field, changes[field]);
    }
    const changed = Object.keys(values).filter((field) => values[field] !== this[field]);
    for (const field of changed) this[field] = values[field];
    if (changed.length) this.touch();
    return changed;
  }

  /** @returns the clean value, or throws DomainError (message shown to the user, in Spanish). */
  validateField(field, value) {
    const text = String(value ?? '').trim();
    switch (field) {
      case 'name':
        if (!text) throw new DomainError('El nombre es obligatorio');
        if (text.length > MAX_TEXT) throw new DomainError(`El nombre puede tener máximo ${MAX_TEXT} caracteres`);
        return text;
      case 'phone':
        if (!PHONE.test(text)) throw new DomainError('Teléfono inválido: use solo números (máximo 20)');
        return text;
      default:
        if (text.length > MAX_TEXT) throw new DomainError(`Máximo ${MAX_TEXT} caracteres`);
        return text;
    }
  }

  /** Links a new profile photo. @returns {string|null} the previous one (to delete it) */
  changeAvatar(url) {
    const previous = this.avatar;
    this.avatar = url;
    this.touch();
    return previous;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      role: this.role,
      name: this.name,
      phone: this.phone,
      location: this.location,
      avatar: this.avatar,
    };
  }
}

export class Producer extends User {
  constructor({ farm, village = '', town = '', crops = [], ...rest }) {
    super(rest);
    this.farm = farm || `Finca de ${this.name}`;
    this.village = village ?? '';
    this.town = town ?? '';
    this.crops = crops;
  }

  get role() {
    return 'PRODUCER';
  }

  ratingCriteria() {
    return ['quality', 'reliability'];
  }

  editableFields() {
    return [...super.editableFields(), 'farm', 'village', 'town'];
  }

  validateField(field, value) {
    if (field === 'farm' && !String(value ?? '').trim()) throw new DomainError('El nombre de la finca es obligatorio');
    return super.validateField(field, value);
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

  editableFields() {
    return [...super.editableFields(), 'type'];
  }

  validateField(field, value) {
    if (field === 'type') {
      if (!Buyer.TYPES.includes(value)) throw new DomainError(`Tipo de comprador inválido: ${value}`);
      return value;
    }
    return super.validateField(field, value);
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
