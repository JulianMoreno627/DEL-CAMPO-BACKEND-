import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createUser } from '../domain/User.js';
import { DomainError } from '../domain/errors.js';

const scrypt = promisify(scryptCallback);
const ROLES = ['PRODUCER', 'BUYER'];

/**
 * Sign-up and login with two profiles: PRODUCER (publishes listings) and BUYER (buys).
 * - Passwords are stored with scrypt + a random salt (never in plain text).
 * - The session is a token signed with HMAC-SHA256 (same principle as a JWT HS256):
 *   the server stores no sessions, it only verifies the signature and the expiration.
 * - Credentials live apart from the User so they never leak through a toJSON().
 */
export class AuthService {
  static SESSION_DURATION_MS = 7 * 86_400_000;
  static MIN_PASSWORD_LENGTH = 6;

  constructor({ userRepo, secret = randomBytes(32) }) {
    this.userRepo = userRepo;
    this.secret = secret;
    this.credentials = new Map(); // email -> { userId, salt, hash } (in production: credential table)
    this.onChange = null; // optional hook to persist the credentials
  }

  /** Credentials in a serializable format (salt and hash in base64; never the password). */
  exportCredentials() {
    return [...this.credentials].map(([email, { userId, salt, hash }]) =>
      ({ email, userId, salt: salt.toString('base64'), hash: hash.toString('base64') }));
  }

  importCredentials(rows) {
    for (const { email, userId, salt, hash } of rows) {
      this.credentials.set(email, { userId, salt: Buffer.from(salt, 'base64'), hash: Buffer.from(hash, 'base64') });
    }
  }

  /** Creates the account and leaves the session started. */
  async register({ role, name, email, password, phone, town, village, farm, type }) {
    if (!ROLES.includes(role)) throw new DomainError('Elija si es productor o comprador');
    email = normalizeEmail(email);
    validatePassword(password);
    const user = createUser({ role, name, phone, town, village, farm, type });
    const credential = await hashPassword(password);
    if (this.credentials.has(email)) throw new DomainError('Ya existe una cuenta con ese correo', 409);
    await this.userRepo.save(user); // Save user FIRST (Postgres foreign key)
    this.credentials.set(email, { userId: user.id, ...credential });
    this.onChange?.();
    return this.#session(user);
  }

  /** Links an email and password to an existing user (demo data). */
  async addCredential(userId, email, password) {
    this.credentials.set(normalizeEmail(email), { userId, ...await hashPassword(password) });
    this.onChange?.();
  }

  /**
   * @param {string} [role] profile chosen on the login screen; rejected if it does not match the account.
   */
  async login({ email, password, role }) {
    const credential = this.credentials.get(String(email ?? '').trim().toLowerCase());
    if (!credential || !await verifyPassword(String(password ?? ''), credential)) {
      throw new DomainError('Correo o contraseña incorrectos', 401);
    }
    const user = await this.userRepo.getOrFail(credential.userId);
    if (role && user.role !== role) {
      throw new DomainError(user.role === 'PRODUCER'
        ? 'Esta cuenta es de productor: ingrese como productor'
        : 'Esta cuenta es de comprador: ingrese como comprador', 403);
    }
    return this.#session(user);
  }

  /** @returns {{ sub: string, role: string, exp: number } | null} */
  verifyToken(token) {
    const [body, signature] = String(token ?? '').split('.');
    if (!body || !signature) return null;
    const expected = Buffer.from(this.#sign(body));
    const received = Buffer.from(signature);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    try {
      const data = JSON.parse(Buffer.from(body, 'base64url').toString());
      return data.exp > Date.now() ? data : null;
    } catch {
      return null;
    }
  }

  #session(user) {
    const body = Buffer.from(JSON.stringify({
      sub: user.id, role: user.role, exp: Date.now() + AuthService.SESSION_DURATION_MS,
    })).toString('base64url');
    return { token: `${body}.${this.#sign(body)}`, user: user.toJSON() };
  }

  #sign(body) {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}

function normalizeEmail(email) {
  const clean = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new DomainError('Correo inválido');
  return clean;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < AuthService.MIN_PASSWORD_LENGTH) {
    throw new DomainError(`La contraseña debe tener al menos ${AuthService.MIN_PASSWORD_LENGTH} caracteres`);
  }
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  return { salt, hash: await scrypt(password, salt, 64) };
}

async function verifyPassword(password, { salt, hash }) {
  return timingSafeEqual(await scrypt(password, salt, 64), hash);
}
