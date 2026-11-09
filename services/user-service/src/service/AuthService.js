import { DomainError } from '@del-campo/shared';
import { createUser } from '../model/User.js';
import { Credential } from '../model/Credential.js';

const ROLES = ['PRODUCER', 'BUYER'];

/**
 * Sign-up and login with two profiles: PRODUCER (publishes listings) and BUYER (buys).
 * The session is a token signed with HMAC-SHA256 (SessionToken); the gateway verifies it
 * with the same secret, without calling this service on every request.
 */
export class AuthService {
  /**
   * @param {object} deps
   * @param {import('@del-campo/shared').Repository} deps.userRepo
   * @param {import('../repository/CredentialRepository.js').InMemoryCredentialRepository} deps.credentialRepo
   * @param {import('@del-campo/shared').SessionToken} deps.sessionToken
   */
  constructor({ userRepo, credentialRepo, sessionToken }) {
    this.userRepo = userRepo;
    this.credentialRepo = credentialRepo;
    this.sessionToken = sessionToken;
  }

  /** Creates the account and leaves the session started. */
  async register({ role, name, email, password, phone, town, village, farm, type }) {
    if (!ROLES.includes(role)) throw new DomainError('Elija si es productor o comprador');
    email = Credential.normalizeEmail(email);
    Credential.validatePassword(password);
    const user = createUser({ role, name, phone, town, village, farm, type });
    if (await this.credentialRepo.findByEmail(email)) throw new DomainError('Ya existe una cuenta con ese correo', 409);
    const credential = await Credential.create(email, user.id, password);
    await this.userRepo.save(user); // the user FIRST (foreign key of credential)
    await this.credentialRepo.save(credential);
    return this.#session(user);
  }

  /** Links an email and password to an existing user (demo accounts). */
  async addCredential(userId, email, password) {
    await this.credentialRepo.save(await Credential.create(email, userId, password));
  }

  /**
   * @param {string} [role] profile chosen on the login screen; rejected if it does not match the account.
   */
  async login({ email, password, role }) {
    const credential = await this.credentialRepo.findByEmail(String(email ?? '').trim().toLowerCase());
    if (!credential || !await credential.matches(password)) {
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

  #session(user) {
    return { token: this.sessionToken.sign({ sub: user.id, role: user.role }), user };
  }
}
