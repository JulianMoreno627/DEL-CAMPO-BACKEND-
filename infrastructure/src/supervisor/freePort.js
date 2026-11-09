import net from 'node:net';

/** A TCP port that is free right now on 127.0.0.1 (for builds and tests that must not collide). */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    }).on('error', reject);
  });
}
