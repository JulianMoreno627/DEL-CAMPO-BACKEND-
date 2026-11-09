import net from 'node:net';
import { GrpcServer, GrpcClient, SERVICES } from '@del-campo/shared';

/**
 * Starts real microservices in this process, each with its own gRPC server on a free port,
 * talking to each other ONLY over gRPC (the same code that runs in production, with in-memory
 * repositories). Only the integration tests import several services at once.
 */
const SERVICE_MODULES = {
  user: ['user-service', 'UserGrpcApi.js', 'registerUserGrpcApi'],
  pricing: ['pricing-service', 'PricingGrpcApi.js', 'registerPricingGrpcApi'],
  reputation: ['reputation-service', 'ReputationGrpcApi.js', 'registerReputationGrpcApi'],
  catalog: ['catalog-service', 'CatalogGrpcApi.js', 'registerCatalogGrpcApi'],
  cart: ['cart-service', 'CartGrpcApi.js', 'registerCartGrpcApi'],
  order: ['order-service', 'OrderGrpcApi.js', 'registerOrderGrpcApi'],
};

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    }).on('error', reject);
  });
}

/**
 * @param {string[]} names services to start
 * @param {object} [options] extra options per service for its createContainer (e.g. { catalog: { harvests } })
 */
export async function startServices(names, options = {}) {
  // 1. Ports first: the clients read their address from the environment when they are created
  for (const name of Object.keys(SERVICES)) process.env[SERVICES[name].portEnv] = String(await freePort());

  const running = {};
  for (const name of names) {
    const [folder, apiFile, registerName] = SERVICE_MODULES[name];
    const { createContainer } = await import(`../../services/${folder}/src/container.js`);
    const api = await import(`../../services/${folder}/src/${apiFile}`);
    const container = await createContainer({ tokenSecret: 'integration-secret', ...options[name] });
    const server = new GrpcServer({ name });
    api[registerName](server, container.controller);
    await server.start(Number(process.env[SERVICES[name].portEnv]));
    running[name] = { container, server, client: new GrpcClient(name) };
  }

  return {
    ...running,
    async stop() {
      for (const { container, server, client } of Object.values(running)) {
        client.close();
        await server.stop(1000);
        await container.close?.();
      }
    },
  };
}
