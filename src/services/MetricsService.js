/**
 * Receives real-user performance metrics (RUM) that the frontend sends
 * with navigator.sendBeacon and summarizes them at the 75th percentile, which is how Google evaluates Core Web Vitals.
 */
export class MetricsService {
  static MAX_SAMPLES = 5000;

  /** Official web.dev thresholds: [good, needs improvement]; above that = poor. */
  static THRESHOLDS = {
    LCP: [2500, 4000],
    INP: [200, 500],
    CLS: [0.1, 0.25],
    FCP: [1800, 3000],
    TTFB: [800, 1800],
  };

  constructor() {
    this.samples = [];
  }

  record(batch) {
    const list = Array.isArray(batch) ? batch : [batch];
    for (const m of list) {
      if (!MetricsService.THRESHOLDS[m?.name] || !Number.isFinite(m.value)) continue;
      this.samples.push({
        name: m.name,
        value: m.value,
        page: String(m.page ?? '/').slice(0, 100),
        connection: m.connection ?? 'unknown',
        at: Date.now(),
      });
    }
    if (this.samples.length > MetricsService.MAX_SAMPLES) {
      this.samples.splice(0, this.samples.length - MetricsService.MAX_SAMPLES);
    }
  }

  static percentile(values, p) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, index)];
  }

  static rate(name, value) {
    const [good, needsImprovement] = MetricsService.THRESHOLDS[name];
    if (value <= good) return 'GOOD';
    if (value <= needsImprovement) return 'NEEDS_IMPROVEMENT';
    return 'POOR';
  }

  summary() {
    return Object.keys(MetricsService.THRESHOLDS).map((name) => {
      const values = this.samples.filter((s) => s.name === name).map((s) => s.value);
      const p75 = MetricsService.percentile(values, 75);
      return {
        name,
        samples: values.length,
        p75,
        rating: p75 == null ? null : MetricsService.rate(name, p75),
        thresholds: MetricsService.THRESHOLDS[name],
      };
    });
  }
}
