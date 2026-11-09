import { GrpcServer } from './grpc/GrpcServer.js';
import { grpcPort } from './config.js';

const MEMORY_REPORT_MS = 15_000;

/**
 * Starts a microservice as a standalone process: gRPC server on its port,
 * health check, memory report to the supervisor and orderly shutdown.
 *
 * @param {object} options
 * @param {string} options.name service name ('user', 'catalog', ...)
 * @param {(server: GrpcServer) => Promise<void>|void} options.register registers the service's gRPC API
 * @param {() => Promise<void>} [options.onStop] releases resources (DB pool, clients)
 */
export async function startService({ name, register, onStop = async () => {} }) {
  const server = new GrpcServer({ name });
  await register(server);
  const port = await server.start(grpcPort(name));
  console.log(`[${name}] gRPC (HTTP/2) en 127.0.0.1:${port}`);

  // When it runs as a child process of the supervisor (infrastructure), it reports over IPC.
  if (process.send) {
    process.send({ type: 'ready', service: name, port });
    const report = () => {
      const { rss, heapUsed } = process.memoryUsage();
      process.send?.({ type: 'memory', service: name, rss, heapUsed });
    };
    report();
    setInterval(report, MEMORY_REPORT_MS).unref();
    // If the supervisor dies, the child must not stay orphaned holding the port
    process.on('disconnect', () => shutdown('disconnect'));
  }

  let stopping = false;
  async function shutdown(reason) {
    if (stopping) return;
    stopping = true;
    console.log(`[${name}] apagando (${reason})`);
    await server.stop();
    await onStop();
    process.exit(0);
  }
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => shutdown(signal));
  return { server, port };
}
