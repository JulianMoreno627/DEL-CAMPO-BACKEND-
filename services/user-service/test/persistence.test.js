import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionToken } from '@del-campo/shared';
import { createContainer } from '../src/container.js';

/**
 * Before the migration this test restarted the monolith over the same JSON file. Now the storage is
 * PostgreSQL (Neon) and the restart is of user-service: a new container over the SAME repositories
 * and the same TOKEN_SECRET must keep the accounts and the open sessions, and must not seed again.
 */
test('persistence: accounts and sessions survive a restart of user-service; the seed is not duplicated', async () => {
  const before = await createContainer({ tokenSecret: 'shared-secret' });
  const { token, user } = await before.authService.register({ role: 'PRODUCER', name: 'Marta', email: 'marta@correo.co', password: 'secreta1' });
  const usersBefore = (await before.userRepo.list()).length;

  const after = await createContainer({
    tokenSecret: 'shared-secret',
    repositories: { userRepo: before.userRepo, credentialRepo: before.credentialRepo },
  });
  assert.equal((await after.authService.login({ email: 'marta@correo.co', password: 'secreta1' })).user.id, user.id);
  assert.equal(new SessionToken('shared-secret').verify(token)?.sub, user.id); // the session is still valid
  assert.equal((await after.userRepo.list()).length, usersBefore); // the seed is not duplicated
});
