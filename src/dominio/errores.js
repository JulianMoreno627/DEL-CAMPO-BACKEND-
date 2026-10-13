/**
 * Jerarquía de errores del dominio. Cada error conoce su código HTTP,
 * así los controladores no necesitan un "switch" por tipo de error.
 */
export class ErrorDominio extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.name = 'ErrorDominio';
    this.status = status;
  }
}

export class NoEncontrado extends ErrorDominio {
  constructor(recurso) {
    super(`${recurso} no encontrado`, 404);
    this.name = 'NoEncontrado';
  }
}

export class TransicionInvalida extends ErrorDominio {
  constructor(desde, hacia) {
    super(`No se puede pasar de ${desde} a ${hacia}`, 422);
    this.name = 'TransicionInvalida';
  }
}

export class ConflictoVersion extends ErrorDominio {
  constructor(actual) {
    super('El registro fue modificado por otro dispositivo', 409);
    this.name = 'ConflictoVersion';
    this.actual = actual;
  }
}
