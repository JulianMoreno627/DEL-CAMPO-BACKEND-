/**
 * Domain error hierarchy. Each error knows its HTTP status code,
 * so controllers do not need a "switch" per error type.
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
