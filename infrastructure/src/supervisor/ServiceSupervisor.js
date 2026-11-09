import { fork } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { checkHealth, grpcAddress } from '@del-campo/shared';

/**
 * Starts every microservice as an INDEPENDENT CHILD PROCESS (child_process.fork), each one with
 * its own gRPC (HTTP/2) port on 127.0.0.1, and keeps them alive.
 *
 * Why processes and not containers: on Render Free a web service can SEND traffic over the private
 * network but cannot RECEIVE it, and the public proxy forwards HTTP/1.1, so gRPC between separate
 * free services does not work. One web service runs this supervisor and the services as children:
 * the logical separation and the gRPC communication are the same as with one container per service.
 *
 * - startAll(): forks them in order and waits until every one answers the gRPC health check.
 * - If a child dies, it is restarted with exponential backoff (1 s, 2 s, 4 s… up to 30 s);
 *   after a minute running without problems the counter starts again.
 * - stopAll(): SIGTERM in reverse order, waiting for each one to finish (SIGKILL after a timeout).
 * - Each child reports its memory over IPC (memory()), to watch the 512 MB of the free plan.
 */
export class ServiceSupervisor extends EventEmitter {
  /**
   * @param {object} options
   * @param {{name: string, entry: string}[]} options.services in start order
   * @param {object} [options.env] environment of the children
   * @param {string[]} [options.execArgv] Node flags of the children (e.g. --max-old-space-size)
   * @param {number} [options.healthTimeoutMs] how long to wait for every service to be SERVING
   * @param {object} [options.log]
   */
  constructor({ services, env = process.env, execArgv = [], healthTimeoutMs = 90_000, log = console }) {
    super();
    this.definitions = services;
    this.env = env;
    this.execArgv = execArgv;
    this.healthTimeoutMs = healthTimeoutMs;
    this.log = log;
    this.stopping = false;
    /** @type {Map<string, {child, startedAt, restarts, memory, timer}>} */
    this.processes = new Map();
  }

  async startAll() {
    for (const definition of this.definitions) this.#spawn(definition);
    await this.waitUntilHealthy();
  }

  #spawn(definition) {
    const previous = this.processes.get(definition.name);
    const child = fork(definition.entry, [], { env: this.env, execArgv: this.execArgv, stdio: 'inherit' });
    const state = { child, startedAt: Date.now(), restarts: previous?.restarts ?? 0, memory: previous?.memory ?? null, timer: null };
    this.processes.set(definition.name, state);

    child.on('message', (message) => {
      if (message?.type === 'memory') state.memory = { rss: message.rss, heapUsed: message.heapUsed, at: Date.now() };
    });
    child.on('exit', (code, signal) => {
      if (this.stopping) return;
      // A process that ran for more than a minute was healthy: the backoff starts again
      if (Date.now() - state.startedAt > 60_000) state.restarts = 0;
      const delay = Math.min(1000 * 2 ** state.restarts, 30_000);
      state.restarts += 1;
      this.log.error(`[supervisor] ${definition.name} terminó (code=${code}, signal=${signal}); se reinicia en ${delay} ms`);
      this.emit('exit', { name: definition.name, code, signal });
      state.timer = setTimeout(() => {
        if (this.stopping) return;
        this.#spawn(definition);
        this.emit('restart', { name: definition.name });
      }, delay);
    });
  }

  /** Waits until every service answers SERVING to the gRPC health check. */
  async waitUntilHealthy(timeoutMs = this.healthTimeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const statuses = await this.health();
      const pending = Object.entries(statuses).filter(([, status]) => status !== 'SERVING').map(([name]) => name);
      if (pending.length === 0) return;
      if (Date.now() > deadline) throw new Error(`Services not ready after ${timeoutMs} ms: ${pending.join(', ')}`);
      await sleep(300);
    }
  }

  /** @returns {Promise<Record<string, string>>} gRPC health of each service */
  async health() {
    const entries = await Promise.all(this.definitions.map(async ({ name }) =>
      [name, await checkHealth(grpcAddress(name), { timeoutMs: 1000 })]));
    return Object.fromEntries(entries);
  }

  /** @returns {Record<string, {pid: number, rssMb: number|null, heapUsedMb: number|null, restarts: number}>} */
  memory() {
    const toMb = (bytes) => (bytes == null ? null : Number((bytes / 1048576).toFixed(1)));
    return Object.fromEntries([...this.processes].map(([name, state]) => [name, {
      pid: state.child.pid,
      rssMb: toMb(state.memory?.rss),
      heapUsedMb: toMb(state.memory?.heapUsed),
      restarts: state.restarts,
    }]));
  }

  /** Orderly shutdown: reverse start order, SIGTERM and wait; SIGKILL after timeoutMs. */
  async stopAll(timeoutMs = 5000) {
    this.stopping = true;
    for (const { name } of [...this.definitions].reverse()) {
      const state = this.processes.get(name);
      if (!state) continue;
      clearTimeout(state.timer);
      const { child } = state;
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      await exited;
      clearTimeout(timer);
    }
  }
}
