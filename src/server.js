import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContainer } from './container.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PORT = Number(process.env.PORT ?? 3000);
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? `${FRONTEND_URL},http://127.0.0.1:5173`).split(',');

// Data (accounts, products, orders…) is saved in data/db.json and survives a restart
const DATA_PATH = process.env.DATA_PATH ?? path.join(root, 'data', 'db.json');
const container = await createContainer({ dataPath: DATA_PATH, tokenSecret: process.env.TOKEN_SECRET });
const app = createApp(container, {
  frontendUrl: FRONTEND_URL,
  allowedOrigins: ALLOWED_ORIGINS,
  ...(process.env.UPLOADS_DIR && { uploadsDir: process.env.UPLOADS_DIR }),
});

app.listen(PORT, () => {
  console.log(`API lista en http://localhost:${PORT}/api`);
  console.log(`  SSR + ISR: http://localhost:${PORT}/productores/p-rosa`);
  console.log(`  SSG:       http://localhost:${PORT}/temporada/`);
  console.log(`  CORS permitido para: ${ALLOWED_ORIGINS.join(', ')}`);
  console.log(`  Datos guardados en: ${DATA_PATH}`);
});

// Ctrl+C: finish writing pending data before exiting
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await container.persistence?.save();
    process.exit(0);
  });
}
