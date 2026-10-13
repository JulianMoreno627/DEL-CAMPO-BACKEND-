/**
 * Incremental Static Regeneration (ISR) on the server:
 * - The first request generates the HTML (SSR) and stores it.
 * - While it is "fresh" it is served from cache (almost instant response → better TTFB).
 * - When it expires, the old version is served (stale) and regenerated in the background
 *   (stale-while-revalidate), so no user waits for the regeneration.
 * - It can also be invalidated by an event (when a harvest changes).
 */
export class IsrCache {
  constructor({ revalidateSeconds = 60 } = {}) {
    this.revalidateMs = revalidateSeconds * 1000;
    this.entries = new Map(); // key -> { html, generatedAt, regenerating }
  }

  /**
   * @param {string} key
   * @param {() => Promise<string>} generate
   * @returns {Promise<{ html: string, status: 'MISS'|'HIT'|'STALE' }>}
   */
  async get(key, generate) {
    const entry = this.entries.get(key);
    if (!entry) {
      const html = await generate();
      this.entries.set(key, { html, generatedAt: Date.now(), regenerating: false });
      return { html, status: 'MISS' };
    }
    if (Date.now() - entry.generatedAt < this.revalidateMs) return { html: entry.html, status: 'HIT' };

    if (!entry.regenerating) {
      entry.regenerating = true;
      generate()
        .then((html) => this.entries.set(key, { html, generatedAt: Date.now(), regenerating: false }))
        .catch(() => { entry.regenerating = false; });
    }
    return { html: entry.html, status: 'STALE' };
  }

  invalidate(key) {
    this.entries.delete(key);
  }
}
