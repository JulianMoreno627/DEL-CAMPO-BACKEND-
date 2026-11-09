import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Context of the request being handled: who is acting (userId, role), the request id that the
 * gateway generated, the deadline and, in the gateway, the timing of each gRPC call.
 *
 * It lives in AsyncLocalStorage so the business code (services, models) never receives
 * gRPC details as parameters: the gRPC server puts the context here and the gRPC clients
 * read it to propagate it to the next service in the metadata.
 *
 * @typedef {object} RequestContext
 * @property {string} [requestId]
 * @property {string|null} [userId]
 * @property {string|null} [role]
 * @property {number} [deadline] absolute time (ms) after which nobody waits for the answer
 * @property {{name:string, dur:number}[]} [timings] gRPC calls made (used for Server-Timing)
 */
const storage = new AsyncLocalStorage();

/** Runs fn inside a context. */
export function runWithContext(context, fn) {
  return storage.run(context, fn);
}

/** @returns {RequestContext} */
export function currentContext() {
  return storage.getStore() ?? {};
}
