/**
 * Domain error hierarchy shared by every service. Each error knows its HTTP status code,
 * so the gateway does not need a "switch" per error type, and it travels between services
 * over gRPC without losing its status, type or current value (see grpc/errorMapping.js).
 * Messages are shown to the user, so they stay in Spanish.
 */
export class DomainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}

export class NotFound extends DomainError {
  constructor(resource) {
    super(`${resource} no encontrado`, 404);
    this.name = 'NotFound';
  }
}

export class InvalidTransition extends DomainError {
  constructor(from, to) {
    super(`No se puede pasar de ${from} a ${to}`, 422);
    this.name = 'InvalidTransition';
  }
}

export class VersionConflict extends DomainError {
  constructor(current) {
    super('El registro fue modificado por otro dispositivo', 409);
    this.name = 'VersionConflict';
    this.current = current;
  }
}

/**
 * Another microservice did not answer (down, restarting or deadline exceeded).
 * It is NOT a DomainError: it is an infrastructure failure, and the gateway answers 503.
 */
export class ServiceUnavailable extends Error {
  constructor(service, cause) {
    super(`Service ${service} unavailable: ${cause?.details ?? cause?.message ?? 'unknown'}`);
    this.name = 'ServiceUnavailable';
    this.status = 503;
    this.service = service;
  }
}
