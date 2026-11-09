import grpc from '@grpc/grpc-js';
import { DomainError, ServiceUnavailable } from '../errors.js';

const Code = grpc.status;

/**
 * Error metadata (trailers). The gRPC code alone is not enough to rebuild the HTTP answer
 * the frontend expects (e.g. 409 "already has orders" and 409 "version conflict" are different
 * errors), so the original status, the type and the current value travel next to it.
 * "-bin" keys carry binary values: the JSON may contain non-ASCII text (Spanish).
 */
export const ERROR_STATUS_KEY = 'x-error-status';
export const ERROR_TYPE_KEY = 'x-error-type';
export const ERROR_CURRENT_KEY = 'x-error-current-bin';

/** Semantic gRPC code for each HTTP status of the domain. */
export function grpcCodeFor(error) {
  switch (error.status) {
    case 400: return Code.INVALID_ARGUMENT;
    case 401: return Code.UNAUTHENTICATED;
    case 403: return Code.PERMISSION_DENIED;
    case 404: return Code.NOT_FOUND;
    case 409: return error.name === 'VersionConflict' ? Code.ABORTED : Code.FAILED_PRECONDITION;
    case 413: return Code.RESOURCE_EXHAUSTED;
    case 422: return Code.FAILED_PRECONDITION;
    default: return error.status >= 500 ? Code.INTERNAL : Code.FAILED_PRECONDITION;
  }
}

/** Server side: converts whatever a handler threw into a gRPC error. */
export function toGrpcError(error) {
  if (error instanceof DomainError) {
    const metadata = new grpc.Metadata();
    metadata.set(ERROR_STATUS_KEY, String(error.status));
    metadata.set(ERROR_TYPE_KEY, error.name);
    if (error.current !== undefined) metadata.set(ERROR_CURRENT_KEY, Buffer.from(JSON.stringify(error.current)));
    return { code: grpcCodeFor(error), details: error.message, metadata };
  }
  if (error instanceof ServiceUnavailable) {
    // A service further down did not answer: it is passed up as is (the gateway answers 503)
    return { code: Code.UNAVAILABLE, details: error.message };
  }
  console.error(error);
  return { code: Code.INTERNAL, details: 'Error interno' };
}

/** Client side: rebuilds the original error from a gRPC error. */
export function fromGrpcError(error, service) {
  const status = error.metadata?.get(ERROR_STATUS_KEY)?.[0];
  if (status) {
    const domainError = new DomainError(error.details, Number(status));
    domainError.name = String(error.metadata.get(ERROR_TYPE_KEY)?.[0] ?? 'DomainError');
    const current = error.metadata.get(ERROR_CURRENT_KEY)?.[0];
    if (current) domainError.current = JSON.parse(Buffer.from(current).toString('utf8'));
    return domainError;
  }
  if ([Code.UNAVAILABLE, Code.DEADLINE_EXCEEDED, Code.CANCELLED].includes(error.code)) {
    return new ServiceUnavailable(service, error);
  }
  const internal = new Error(`${service}: ${error.details ?? error.message}`);
  internal.status = 500;
  return internal;
}
