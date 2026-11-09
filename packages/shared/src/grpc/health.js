import grpc from '@grpc/grpc-js';
import { loadContract } from './protoLoader.js';

export const ServingStatus = Object.freeze({
  SERVING: 'SERVING',
  NOT_SERVING: 'NOT_SERVING',
  SERVICE_UNKNOWN: 'SERVICE_UNKNOWN',
});

/**
 * Server side of the standard gRPC Health Checking Protocol.
 * "" is the state of the whole server; each registered service has its own entry.
 */
export class HealthService {
  #statuses = new Map([['', ServingStatus.NOT_SERVING]]);
  #watchers = new Set();

  setStatus(service, status) {
    this.#statuses.set(service, status);
    for (const watcher of this.#watchers) {
      if (watcher.service === service) watcher.call.write({ status });
    }
  }

  statusOf(service) {
    return this.#statuses.get(service);
  }

  handlers() {
    return {
      check: (call, callback) => {
        const status = this.#statuses.get(call.request.service);
        if (!status) return callback({ code: grpc.status.NOT_FOUND, details: 'Unknown service' });
        callback(null, { status });
      },
      watch: (call) => {
        const watcher = { service: call.request.service, call };
        this.#watchers.add(watcher);
        call.write({ status: this.#statuses.get(watcher.service) ?? ServingStatus.SERVICE_UNKNOWN });
        call.on('cancelled', () => this.#watchers.delete(watcher));
      },
    };
  }

  /** Closes the open Watch streams (when the server stops). */
  closeWatchers() {
    for (const { call } of this.#watchers) call.end();
    this.#watchers.clear();
  }
}

const clients = new Map();

/**
 * Asks a server for its state.
 * @returns {Promise<'SERVING'|'NOT_SERVING'|'SERVICE_UNKNOWN'|'UNREACHABLE'>}
 */
export function checkHealth(address, { service = '', timeoutMs = 1000 } = {}) {
  if (!clients.has(address)) {
    const { Client } = loadContract('health');
    clients.set(address, new Client(address, grpc.credentials.createInsecure()));
  }
  return new Promise((resolve) => {
    clients.get(address).check({ service }, { deadline: Date.now() + timeoutMs }, (error, response) => {
      resolve(error ? 'UNREACHABLE' : response.status);
    });
  });
}

/** Closes the clients used by checkHealth (to let the process exit). */
export function closeHealthClients() {
  for (const client of clients.values()) client.close();
  clients.clear();
}
