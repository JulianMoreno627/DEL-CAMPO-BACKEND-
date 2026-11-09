import { startService, databaseUrl } from '@del-campo/shared';
import { createContainer } from './container.js';
import { registerCatalogGrpcApi } from './CatalogGrpcApi.js';

const container = await createContainer({ databaseUrl: databaseUrl() });

await startService({
  name: 'catalog',
  register: (server) => registerCatalogGrpcApi(server, container.controller),
  onStop: container.close,
});
