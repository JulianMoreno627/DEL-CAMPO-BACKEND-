import { startService, databaseUrl } from '@del-campo/shared';
import { createContainer } from './container.js';
import { registerOrderGrpcApi } from './OrderGrpcApi.js';

const container = await createContainer({ databaseUrl: databaseUrl() });

await startService({
  name: 'order',
  register: (server) => registerOrderGrpcApi(server, container.controller),
  onStop: container.close,
});
