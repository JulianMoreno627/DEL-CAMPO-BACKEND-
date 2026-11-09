import { EventEmitter } from 'node:events';

/**
 * Observer pattern inside order-service: every order change is published here
 * (in a later delivery, a Web Push notifier can tell the buyer when an order is confirmed).
 */
export class EventBus extends EventEmitter {
  static ORDER_CHANGED = 'order:changed';
}
