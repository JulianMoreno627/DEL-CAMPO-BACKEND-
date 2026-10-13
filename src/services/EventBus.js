import { EventEmitter } from 'node:events';

/**
 * Observer pattern: services publish domain events and other modules subscribe
 * without coupling (e.g. the ISR cache is invalidated when a harvest changes;
 * in a later delivery, a Web Push notifier can tell buyers when an order is confirmed).
 */
export class EventBus extends EventEmitter {
  static HARVEST_CHANGED = 'harvest:changed';
  static ORDER_CHANGED = 'order:changed';
}
