import { SessionToken, createPool, waitForDatabase } from '@del-campo/shared';
import { createUser } from './model/User.js';
import { InMemoryUserRepository, PostgresUserRepository } from './repository/UserRepository.js';
import { InMemoryCredentialRepository, PostgresCredentialRepository } from './repository/CredentialRepository.js';
import { AuthService } from './service/AuthService.js';
import { UserService } from './service/UserService.js';
import { UserController } from './controller/UserController.js';
import { demoUsers, DEMO_PASSWORD } from './seed.js';

/**
 * Composition root of user-service (manual dependency injection).
 * Only here it is decided which repository implementation is used.
 *
 * @param {object} options
 * @param {string} options.tokenSecret secret shared with the gateway (TOKEN_SECRET)
 * @param {string|null} [options.databaseUrl] Neon (pooled); without it, in-memory repositories
 * @param {boolean} [options.withSeed] creates the demo accounts if there are no users
 */
export async function createContainer({ tokenSecret, databaseUrl = null, withSeed = true }) {
  const pool = databaseUrl ? createPool(databaseUrl) : null;
  if (pool) await waitForDatabase(pool);

  const userRepo = pool ? new PostgresUserRepository({ pool }) : new InMemoryUserRepository();
  const credentialRepo = pool ? new PostgresCredentialRepository({ pool }) : new InMemoryCredentialRepository();

  const authService = new AuthService({ userRepo, credentialRepo, sessionToken: new SessionToken(tokenSecret) });
  const userService = new UserService({ userRepo });
  const controller = new UserController({ authService, userService });

  if (withSeed && (await userRepo.list()).length === 0) {
    for (const { email, ...data } of demoUsers) {
      await userRepo.save(createUser(data));
      await authService.addCredential(data.id, email, DEMO_PASSWORD);
    }
  }

  return { userRepo, credentialRepo, authService, userService, controller, close: async () => pool?.end() };
}
