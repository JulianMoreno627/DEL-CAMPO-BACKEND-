import { EventEmitter } from 'node:events';

/**
 * Observer pattern inside catalog-service: the services publish domain events and other
 * modules subscribe without coupling. HARVEST_CHANGED is also sent to other processes
 * through the gRPC stream WatchHarvestChanges (the gateway invalidates its ISR cache with it).
 */
export class EventBus extends EventEmitter {
  static HARVEST_CHANGED = 'harvest:changed';
}
