/**
 * Recibe las métricas de rendimiento reales de los usuarios (RUM) que envía el frontend
 * con navigator.sendBeacon y las resume en el percentil 75, que es como Google evalúa las Core Web Vitals.
 */
export class MetricasService {
  static MAX_MUESTRAS = 5000;

  /** Umbrales oficiales de web.dev: [bueno, necesita mejora]; por encima = pobre. */
  static UMBRALES = {
    LCP: [2500, 4000],
    INP: [200, 500],
    CLS: [0.1, 0.25],
    FCP: [1800, 3000],
    TTFB: [800, 1800],
  };

  constructor() {
    this.muestras = [];
  }

  registrar(lote) {
    const lista = Array.isArray(lote) ? lote : [lote];
    for (const m of lista) {
      if (!MetricasService.UMBRALES[m?.nombre] || !Number.isFinite(m.valor)) continue;
      this.muestras.push({
        nombre: m.nombre,
        valor: m.valor,
        pagina: String(m.pagina ?? '/').slice(0, 100),
        conexion: m.conexion ?? 'desconocida',
        en: Date.now(),
      });
    }
    if (this.muestras.length > MetricasService.MAX_MUESTRAS) {
      this.muestras.splice(0, this.muestras.length - MetricasService.MAX_MUESTRAS);
    }
  }

  static percentil(valores, p) {
    if (!valores.length) return null;
    const ordenados = [...valores].sort((a, b) => a - b);
    const idx = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
    return ordenados[Math.max(0, idx)];
  }

  static calificar(nombre, valor) {
    const [bueno, mejora] = MetricasService.UMBRALES[nombre];
    if (valor <= bueno) return 'BUENO';
    if (valor <= mejora) return 'NECESITA_MEJORA';
    return 'POBRE';
  }

  resumen() {
    return Object.keys(MetricasService.UMBRALES).map((nombre) => {
      const valores = this.muestras.filter((m) => m.nombre === nombre).map((m) => m.valor);
      const p75 = MetricasService.percentil(valores, 75);
      return {
        nombre,
        muestras: valores.length,
        p75,
        calificacion: p75 == null ? null : MetricasService.calificar(nombre, p75),
        umbrales: MetricasService.UMBRALES[nombre],
      };
    });
  }
}
