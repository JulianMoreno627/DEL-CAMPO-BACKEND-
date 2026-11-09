import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DomainError } from '@del-campo/shared';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

/**
 * Login data of a user, kept apart from the User so the hash never leaks through a toJSON().
 * The password is stored with scrypt + a random salt (never in plain text).
 */
export class Credential {
  static MIN_PASSWORD_LENGTH = 6;

  /**
   * @param {object} data
   * @param {string} data.email normalized email
   * @param {string} data.userId
   * @param {Buffer} data.salt
   * @param {Buffer} data.hash
   */
  constructor({ email, userId, salt, hash }) {
    this.email = email;
    this.userId = userId;
    this.salt = salt;
    this.hash = hash;
  }

  static async create(email, userId, password) {
    Credential.validatePassword(password);
    const salt = randomBytes(16);
    return new Credential({ email: Credential.normalizeEmail(email), userId, salt, hash: await scrypt(password, salt, KEY_LENGTH) });
  }

  async matches(password) {
    return timingSafeEqual(await scrypt(String(password ?? ''), this.salt, KEY_LENGTH), this.hash);
  }

  static normalizeEmail(email) {
    const clean = String(email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new DomainError('Correo inválido');
    return clean;
  }

  static validatePassword(password) {
    if (typeof password !== 'string' || password.length < Credential.MIN_PASSWORD_LENGTH) {
      throw new DomainError(`La contraseña debe tener al menos ${Credential.MIN_PASSWORD_LENGTH} caracteres`);
    }
  }
}
