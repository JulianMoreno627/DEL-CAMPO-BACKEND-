import grpc from '@grpc/grpc-js';
import { performance } from 'node:perf_hooks';
import { loadContract } from './protoLoader.js';
import { fromGrpcError } from './errorMapping.js';
import { currentContext } from '../context.js';
import { grpcAddress, grpcDeadlineMs } from '../config.js';

/**
 * Promise-based client of another microservice's gRPC API.
 * - Every call has a deadline: the configured one (GRPC_DEADLINE_MS) or, if the current
 *   request has less time left, the parent's deadline (it never waits longer than the caller).
 * - The metadata propagates x-request-id, x-user-id and x-user-role of the current context.
 * - Errors are rebuilt as the original DomainError (same status, type and current value).
 * - If the context has a "timings" list (gateway), the duration of the call is added (Server-Timing).
 */
export class GrpcClient {
  /**
   * @param {string} service contract / service name: 'user', 'catalog', ...
   * @param {object} [options]
   * @param {string} [options.address] host:port (default: the configured one for the service)
   * @param {number} [options.deadlineMs]
   */
  constructor(service, { address = grpcAddress(service), deadlineMs = grpcDeadlineMs() } = {}) {
    const { Client } = loadContract(service);
    this.service = service;
    this.deadlineMs = deadlineMs;
    this.stub = new Client(address, grpc.credentials.createInsecure(), {
      'grpc.keepalive_time_ms': 60_000,
      'grpc.max_receive_message_length': 8 * 1024 * 1024,
    });
  }

  /**
   * @param {string} method RPC name as in the .proto (e.g. 'GetUser')
   * @param {object} [request]
   */
  call(method, request = {}) {
    const context = currentContext();
    const deadline = Math.min(Date.now() + this.deadlineMs, context.deadline ?? Infinity);
    const start = performance.now();
    return new Promise((resolve, reject) => {
      this.stub[method](request, metadataFrom(context), { deadline }, (error, response) => {
        context.timings?.push({ name: `${this.service}.${method}`, dur: performance.now() - start });
        if (error) reject(fromGrpcError(error, this.service));
        else resolve(response);
      });
    });
  }

  /** Server-side stream (e.g. WatchHarvestChanges). Returns the grpc call (EventEmitter). */
  stream(method, request = {}) {
    return this.stub[method](request, metadataFrom(currentContext()));
  }

  close() {
    this.stub.close();
  }
}

function metadataFrom({ requestId, userId, role }) {
  const metadata = new grpc.Metadata();
  if (requestId) metadata.set('x-request-id', requestId);
  if (userId) metadata.set('x-user-id', userId);
  if (role) metadata.set('x-user-role', role);
  return metadata;
}
