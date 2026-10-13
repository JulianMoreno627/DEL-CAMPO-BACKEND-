/**
 * Static Site Generation (SSG) build: generates public/temporada/index.html once.
 * It runs automatically before "npm start" (prestart script).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContainer } from '../src/container.js';
import { seasonPage } from '../src/render/pages.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

const start = performance.now();
const { catalogService } = await createContainer({ dataPath: process.env.DATA_PATH ?? path.join(root, 'data', 'db.json') });
const html = seasonPage(await catalogService.season(), { frontendUrl });

// The URL stays in Spanish (/temporada/) because users see it
const target = path.join(root, 'public', 'temporada');
await mkdir(target, { recursive: true });
await writeFile(path.join(target, 'index.html'), html);
console.log(`SSG: public/temporada/index.html (${(html.length / 1024).toFixed(1)} KB) en ${(performance.now() - start).toFixed(0)} ms`);
