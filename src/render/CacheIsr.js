/**
 * Incremental Static Regeneration (ISR) en el servidor:
 * - La primera petición genera el HTML (SSR) y lo guarda.
 * - Mientras esté "fresco" se sirve desde caché (respuesta casi instantánea → mejor TTFB).
 * - Cuando vence, se sirve la versión vieja (stale) y se regenera en segundo plano
 *   (stale-while-revalidate), así ningún usuario espera la regeneración.
 * - Además se puede invalidar por evento (cuando cambia una cosecha).
 */
export class CacheIsr {
  constructor({ revalidarSegundos = 60 } = {}) {
    this.revalidarMs = revalidarSegundos * 1000;
    this.entradas = new Map(); // clave -> { html, generadoEn, regenerando }
  }

  /**
   * @param {string} clave
   * @param {() => Promise<string>} generar
   * @returns {Promise<{ html: string, estado: 'MISS'|'HIT'|'STALE' }>}
   */
  async obtener(clave, generar) {
    const entrada = this.entradas.get(clave);
    if (!entrada) {
      const html = await generar();
      this.entradas.set(clave, { html, generadoEn: Date.now(), regenerando: false });
      return { html, estado: 'MISS' };
    }
    if (Date.now() - entrada.generadoEn < this.revalidarMs) return { html: entrada.html, estado: 'HIT' };

    if (!entrada.regenerando) {
      entrada.regenerando = true;
      generar()
        .then((html) => this.entradas.set(clave, { html, generadoEn: Date.now(), regenerando: false }))
        .catch(() => { entrada.regenerando = false; });
    }
    return { html: entrada.html, estado: 'STALE' };
  }

  invalidar(clave) {
    this.entradas.delete(clave);
  }
}
