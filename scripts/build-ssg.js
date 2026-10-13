/**
 * Build de Static Site Generation (SSG): genera public/temporada/index.html una sola vez.
 * Se ejecuta automáticamente antes de "npm start" (script prestart).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearContenedor } from '../src/contenedor.js';
import { paginaTemporada } from '../src/render/paginas.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

const inicio = performance.now();
const { catalogoService } = await crearContenedor();
const html = paginaTemporada(await catalogoService.temporada(), { frontendUrl });

const destino = path.join(raiz, 'public', 'temporada');
await mkdir(destino, { recursive: true });
await writeFile(path.join(destino, 'index.html'), html);
console.log(`SSG: public/temporada/index.html (${(html.length / 1024).toFixed(1)} KB) en ${(performance.now() - inicio).toFixed(0)} ms`);
