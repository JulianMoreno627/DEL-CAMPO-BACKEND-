import { startService, databaseUrl } from '@del-campo/shared';
import { createContainer } from './container.js';
import { registerReputationGrpcApi } from './ReputationGrpcApi.js';

const container = await createContainer({ databaseUrl: databaseUrl() });

await startService({
  name: 'reputation',
  register: (server) => registerReputationGrpcApi(server, container.controller),
  onStop: container.close,
});
