import { layout, tarjetaCosecha, escapar, formatoPesos, formatoMes, ETIQUETA_ESTADO } from './plantillas.js';

/**
 * Página del productor — SSR (+ caché ISR).
 * Se renderiza en el servidor porque: llega lista para leer en celulares de gama baja
 * (no hay que descargar ni ejecutar el JS de la SPA), y es indexable/compartible por WhatsApp.
 * Incluye una "isla" de interactividad: un script mínimo que refresca solo las cantidades libres,
 * porque el HTML puede venir de la caché ISR con hasta 60 s de antigüedad.
 */
export function paginaProductor({ productor, cosechas, reputacion }, { frontendUrl, generadoEn = new Date() }) {
  const visibles = cosechas.filter((c) => c.estado !== 'AGOTADO');
  const cuerpo = `
<p class="suave">${escapar(productor.vereda)} · ${escapar(productor.municipio)}</p>
<h1>${escapar(productor.finca)}</h1>
<p>Productor: <strong>${escapar(productor.nombre)}</strong></p>
<div class="tarjeta fila">
  <span>Reputación: <strong>${reputacion.puntaje.toFixed(1)} / 5</strong></span>
  <span class="chip">${escapar(reputacion.nivel)}</span>
  <span class="suave">${reputacion.total} calificaciones</span>
</div>
<h2>Cosechas (${visibles.length})</h2>
${visibles.map(tarjetaCosecha).join('') || '<p class="suave">No hay cosechas publicadas por ahora.</p>'}
<p><a class="btn" href="${escapar(frontendUrl)}#/catalogo?productor=${encodeURIComponent(productor.id)}">Reservar en la app</a></p>
<p class="suave">Página generada en el servidor el <time>${generadoEn.toISOString()}</time>. <span id="estado-isla"></span></p>`;

  const isla = `<script type="module">
// Isla de hidratación parcial: solo esta parte de la página ejecuta JS.
const id = ${JSON.stringify(productor.id).replaceAll('<', '\\u003c')};
try {
  const r = await fetch('/api/productores/' + encodeURIComponent(id));
  if (r.ok) {
    const { cosechas } = await r.json();
    for (const c of cosechas) {
      const el = document.querySelector('[data-cosecha="' + c.id + '"] [data-libre]');
      if (el) el.textContent = c.cantidadLibre;
    }
    document.getElementById('estado-isla').textContent = 'Cantidades actualizadas en vivo.';
  }
} catch { /* sin señal: se queda el HTML del servidor */ }
</script>`;

  return layout({
    titulo: productor.finca,
    descripcion: `Cosechas de ${productor.nombre} en la vereda ${productor.vereda}, ${productor.municipio}.`,
    cuerpo,
    frontendUrl,
    scripts: isla,
  });
}

/**
 * Calendario de temporada — SSG (Static Site Generation).
 * Se genera una sola vez en "npm run build" y se sirve como archivo estático:
 * cero cómputo por petición y se puede cachear en CDN. Cambia poco (por temporada).
 */
export function paginaTemporada(meses, { frontendUrl, generadoEn = new Date() }) {
  const cuerpo = `
<h1>Calendario de cosechas</h1>
<p class="suave">Qué estará disponible y cuándo, directamente de las fincas. Reserve antes de la cosecha.</p>
${meses.map(({ mes, cosechas }) => `
<h2>${escapar(formatoMes(mes))}</h2>
${cosechas.map((c) => `
<div class="tarjeta fila">
  <strong>${escapar(c.producto)}</strong>
  <span class="chip ${escapar(c.estado)}">${ETIQUETA_ESTADO[c.estado]}</span>
  <span class="precio">${formatoPesos(c.precioUnitario)} / ${escapar(c.unidad)}</span>
  <a href="/productores/${encodeURIComponent(c.productor.id)}">${escapar(c.productor.finca)} — ${escapar(c.productor.vereda)}</a>
</div>`).join('')}`).join('')}
<p class="suave">Página estática generada el ${generadoEn.toISOString()} (SSG).</p>`;

  return layout({ titulo: 'Calendario de temporada', descripcion: 'Calendario de cosechas por mes', cuerpo, frontendUrl });
}
