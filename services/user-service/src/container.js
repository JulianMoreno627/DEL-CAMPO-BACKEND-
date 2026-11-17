import path from 'node:path';
import { SessionToken, createPool, waitForDatabase, uploadsDir } from '@del-campo/shared';
import { PostgresAvatarStorage, DiskAvatarStorage } from './repository/AvatarStorage.js';
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
 * @param {object} [options.repositories] { userRepo, credentialRepo } already created (tests: simulates a restart over the same storage)
 * @param {string} [options.avatarsDir] folder of the profile photos when there is no database
 */
export async function createContainer({
  tokenSecret, databaseUrl = null, withSeed = true, repositories = {}, avatarsDir = path.join(uploadsDir(), 'avatars'),
}) {
  const pool = databaseUrl ? createPool(databaseUrl) : null;
  if (pool) await waitForDatabase(pool);

  const userRepo = repositories.userRepo ?? (pool ? new PostgresUserRepository({ pool }) : new InMemoryUserRepository());
  const credentialRepo = repositories.credentialRepo ?? (pool ? new PostgresCredentialRepository({ pool }) : new InMemoryCredentialRepository());

  const authService = new AuthService({ userRepo, credentialRepo, sessionToken: new SessionToken(tokenSecret) });
  // With a database the profile photos live in Neon (the disk of Render Free is erased on every restart)
  const avatarStorage = pool ? new PostgresAvatarStorage({ pool }) : new DiskAvatarStorage({ directory: avatarsDir });
  const userService = new UserService({ userRepo, avatarStorage });
  const controller = new UserController({ authService, userService });

  if (withSeed && (await userRepo.list()).length === 0) {
    for (const { email, ...data } of demoUsers) {
      await userRepo.save(createUser(data));
      await authService.addCredential(data.id, email, DEMO_PASSWORD);
    }
  }

  return { userRepo, credentialRepo, avatarStorage, authService, userService, controller, close: async () => pool?.end() };
}
