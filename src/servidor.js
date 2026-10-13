import { crearContenedor } from './contenedor.js';
import { crearApp } from './app.js';

const PUERTO = Number(process.env.PORT ?? 3000);
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const ORIGENES = (process.env.ORIGENES_PERMITIDOS ?? `${FRONTEND_URL},http://127.0.0.1:5173`).split(',');

const contenedor = await crearContenedor();
const app = crearApp(contenedor, { frontendUrl: FRONTEND_URL, origenesPermitidos: ORIGENES });

app.listen(PUERTO, () => {
  console.log(`API lista en http://localhost:${PUERTO}/api`);
  console.log(`  SSR + ISR: http://localhost:${PUERTO}/productores/p-rosa`);
  console.log(`  SSG:       http://localhost:${PUERTO}/temporada/`);
  console.log(`  CORS permitido para: ${ORIGENES.join(', ')}`);
});
