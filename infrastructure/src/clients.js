import { GrpcClient } from '@del-campo/shared';

/** gRPC clients of the gateway towards every microservice (addresses from *_GRPC_PORT). */
export function createGrpcClients() {
  const names = ['user', 'catalog', 'cart', 'order', 'reputation', 'pricing'];
  const clients = Object.fromEntries(names.map((name) => [name, new GrpcClient(name)]));
  return {
    ...clients,
    close() {
      for (const name of names) clients[name].close();
    },
  };
}
