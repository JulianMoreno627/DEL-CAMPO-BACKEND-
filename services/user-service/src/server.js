import { startService, databaseUrl } from '@del-campo/shared';
import { createContainer } from './container.js';
import { registerUserGrpcApi } from './UserGrpcApi.js';

const tokenSecret = process.env.TOKEN_SECRET;
if (!tokenSecret) {
  console.error('[user] falta TOKEN_SECRET (el supervisor lo entrega; ver .env.example)');
  process.exit(1);
}

const container = await createContainer({ tokenSecret, databaseUrl: databaseUrl() });

await startService({
  name: 'user',
  register: (server) => registerUserGrpcApi(server, container.controller),
  onStop: container.close,
});
