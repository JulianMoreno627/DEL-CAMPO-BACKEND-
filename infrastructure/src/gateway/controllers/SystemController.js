/**
 * Health of the whole system and real-user metrics (RUM). The metrics live in the gateway:
 * they are not business data and they do not need a microservice.
 */
export class SystemController {
  /**
   * @param {object} deps
   * @param {() => Promise<{services: object, database: string, memory?: object}>} deps.healthProbe
   * @param {import('../../metrics/MetricsService.js').MetricsService} deps.metricsService
   */
  constructor({ healthProbe, metricsService }) {
    this.healthProbe = healthProbe;
    this.metricsService = metricsService;
  }

  /** 200 if every microservice answers SERVING and the database is reachable; 503 otherwise. */
  health = async (_req, res) => {
    const { services, database, memory } = await this.healthProbe();
    const ok = Object.values(services).every((status) => status === 'SERVING') && database !== 'DOWN';
    res.status(ok ? 200 : 503).json({ ok, time: new Date().toISOString(), services, database, ...(memory && { memory }) });
  };

  /** sendBeacon sends text/plain to avoid a CORS preflight. A malformed metric must not break anything. */
  recordMetrics = (req, res) => {
    try {
      this.metricsService.record(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
    } catch { /* ignored */ }
    res.sendStatus(204);
  };

  metricsSummary = (_req, res) => {
    res.json(this.metricsService.summary());
  };
}
