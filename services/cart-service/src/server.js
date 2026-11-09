import { startService, databaseUrl } from '@del-campo/shared';
import { createContainer } from './container.js';
import { registerCartGrpcApi } from './CartGrpcApi.js';

const container = await createContainer({ databaseUrl: databaseUrl() });

await startService({
  name: 'cart',
  register: (server) => registerCartGrpcApi(server, container.controller),
  onStop: container.close,
});
