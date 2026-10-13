import { EventEmitter } from 'node:events';

/**
 * Patrón Observer: los servicios publican eventos de dominio y otros módulos
 * se suscriben sin acoplarse (p. ej. la caché ISR se invalida cuando cambia una cosecha;
 * en la siguiente entrega, el notificador Web Push avisa cuando una cosecha reservada queda DISPONIBLE).
 */
export class BusEventos extends EventEmitter {
  static COSECHA_CAMBIADA = 'cosecha:cambiada';
  static RESERVA_CAMBIADA = 'reserva:cambiada';
}
