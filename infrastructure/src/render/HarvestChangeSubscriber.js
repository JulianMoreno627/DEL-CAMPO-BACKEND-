/**
 * Subscribes to catalog-service's server-side gRPC stream WatchHarvestChanges and invalidates
 * the ISR page of the producer whose harvest changed (/productores/:id).
 * If the stream breaks (catalog-service restarting), it reconnects with backoff and clears the
 * whole cache, because some events may have been missed meanwhile. Besides, every page expires
 * on its own after 60 s (TTL), so a lost event never leaves a page stale for long.
 */
export class HarvestChangeSubscriber {
  /**
   * @param {object} options
   * @param {import('@del-campo/shared').GrpcClient} options.catalog
   * @param {import('./IsrCache.js').IsrCache} options.isrCache
   */
  constructor({ catalog, isrCache, log = console, maxDelayMs = 30_000 }) {
    this.catalog = catalog;
    this.isrCache = isrCache;
    this.log = log;
    this.maxDelayMs = maxDelayMs;
    this.attempt = 0;
    this.stopped = false;
    this.call = null;
    this.timer = null;
  }

  start() {
    this.stopped = false;
    this.#subscribe();
    return this;
  }

  #subscribe() {
    if (this.stopped) return;
    const call = this.catalog.stream('WatchHarvestChanges');
    this.call = call;
    this.isrCache.clear(); // events may have been missed while disconnected
    call.on('metadata', () => { this.attempt = 0; }); // the server accepted the subscription
    call.on('data', ({ producerId }) => this.isrCache.invalidate(`/productores/${producerId}`));
    call.on('error', () => {}); // 'end'/'close' decide; an error is followed by them
    call.on('close', () => this.#reconnect(call));
    call.on('end', () => this.#reconnect(call));
  }

  #reconnect(call) {
    if (this.stopped || this.call !== call) return;
    this.call = null;
    const delay = Math.min(500 * 2 ** this.attempt, this.maxDelayMs);
    this.attempt += 1;
    this.log.warn?.(`[gateway] stream de cambios de cosechas cortado; reintento en ${delay} ms`);
    this.timer = setTimeout(() => this.#subscribe(), delay);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.call?.cancel();
  }
}
