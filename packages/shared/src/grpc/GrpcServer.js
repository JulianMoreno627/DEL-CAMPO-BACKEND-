import grpc from '@grpc/grpc-js';
import { randomUUID } from 'node:crypto';
import { loadContract } from './protoLoader.js';
import { HealthService, ServingStatus } from './health.js';
import { toGrpcError } from './errorMapping.js';
import { runWithContext } from '../context.js';

/**
 * gRPC server (HTTP/2) of a microservice. It always includes the Health service.
 * It listens on 127.0.0.1: only the processes on the same machine (the other services
 * and the gateway) can call it; the internet only reaches the gateway.
 */
export class GrpcServer {
  constructor({ name }) {
    this.name = name;
    this.server = new grpc.Server();
    this.health = new HealthService();
    this.serviceNames = [];
    this.server.addService(loadContract('health').definition, this.health.handlers());
  }

  /**
   * @param {string} contractName name in protoLoader (e.g. 'catalog')
   * @param {object} handlers implementation of each RPC (usually built with unary())
   */
  addService(contractName, handlers) {
    const { definition, fullName } = loadContract(contractName);
    this.server.addService(definition, handlers);
    this.serviceNames.push(fullName);
    this.health.setStatus(fullName, ServingStatus.NOT_SERVING);
  }

  /** @returns {Promise<number>} the bound port (useful with port 0 in the tests) */
  async start(port, host = process.env.GRPC_BIND_HOST ?? '127.0.0.1') {
    const boundPort = await new Promise((resolve, reject) => {
      this.server.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), (error, bound) =>
        (error ? reject(error) : resolve(bound)));
    });
    for (const name of ['', ...this.serviceNames]) this.health.setStatus(name, ServingStatus.SERVING);
    return boundPort;
  }

  /** Stops accepting calls, lets the running ones finish (up to timeoutMs) and closes. */
  async stop(timeoutMs = 5000) {
    for (const name of ['', ...this.serviceNames]) this.health.setStatus(name, ServingStatus.NOT_SERVING);
    this.health.closeWatchers();
    await new Promise((resolve) => {
      const timer = setTimeout(() => { this.server.forceShutdown(); resolve(); }, timeoutMs);
      this.server.tryShutdown(() => { clearTimeout(timer); resolve(); });
    });
  }
}

/**
 * Adapter for unary RPCs: reads the context from the metadata, runs the handler inside it
 * and converts its errors to gRPC errors. The handler is a plain async function (request) → response.
 * @param {(request: object) => Promise<object>} handler
 */
export function unary(handler) {
  return (call, callback) => {
    runWithContext(contextFromCall(call), async () => {
      try {
        callback(null, await handler(call.request));
      } catch (error) {
        callback(toGrpcError(error));
      }
    });
  };
}

/** Context propagated by the caller in the metadata. */
export function contextFromCall(call) {
  const read = (key) => call.metadata.get(key)?.[0]?.toString() || null;
  const deadline = call.getDeadline?.();
  const deadlineMs = deadline instanceof Date ? deadline.getTime() : Number(deadline);
  return {
    requestId: read('x-request-id') ?? randomUUID(),
    userId: read('x-user-id'),
    role: read('x-user-role'),
    deadline: Number.isFinite(deadlineMs) ? deadlineMs : undefined,
  };
}
