import { layout, harvestCard, escapeHtml, formatPrice, formatMonth, STATUS_LABEL, LEVEL_LABEL } from './templates.js';

/**
 * Producer page — SSR (+ ISR cache).
 * Rendered on the server because it arrives ready to read on low-end phones
 * (no need to download and run the SPA's JS), and it can be indexed and shared on WhatsApp.
 * It includes an "island" of interactivity: a tiny script that refreshes only the free quantities,
 * because the HTML may come from the ISR cache and be up to 60 s old.
 */
export function producerPage({ producer, harvests, reputation }, { frontendUrl, generatedAt = new Date() }) {
  const visible = harvests.filter((h) => h.status !== 'SOLD_OUT');
  const body = `
<p class="muted">${escapeHtml(producer.village)} · ${escapeHtml(producer.town)}</p>
<h1>${escapeHtml(producer.farm)}</h1>
<p>Productor: <strong>${escapeHtml(producer.name)}</strong></p>
<div class="card row">
  <span>Reputación: <strong>${reputation.score.toFixed(1)} / 5</strong></span>
  <span class="chip">${escapeHtml(LEVEL_LABEL[reputation.level] ?? reputation.level)}</span>
  <span class="muted">${reputation.total} calificaciones</span>
</div>
<h2>Cosechas (${visible.length})</h2>
${visible.map(harvestCard).join('') || '<p class="muted">No hay cosechas publicadas por ahora.</p>'}
<p><a class="btn" href="${escapeHtml(frontendUrl)}#/productos">Comprar en la app</a></p>
<p class="muted">Página generada en el servidor el <time>${generatedAt.toISOString()}</time>. <span id="island-status"></span></p>`;

  const island = `<script type="module">
// Partial hydration island: only this part of the page runs JS.
const id = ${JSON.stringify(producer.id).replaceAll('<', '\\u003c')};
try {
  const response = await fetch('/api/producers/' + encodeURIComponent(id));
  if (response.ok) {
    const { harvests } = await response.json();
    for (const h of harvests) {
      const el = document.querySelector('[data-harvest="' + h.id + '"] [data-free]');
      if (el) el.textContent = h.freeQuantity;
    }
    document.getElementById('island-status').textContent = 'Cantidades actualizadas en vivo.';
  }
} catch { /* no signal: keep the server HTML */ }
</script>`;

  return layout({
    title: producer.farm,
    description: `Cosechas de ${producer.name} en la vereda ${producer.village}, ${producer.town}.`,
    body,
    frontendUrl,
    scripts: island,
  });
}

/**
 * Season calendar — SSG (Static Site Generation).
 * Generated once in "npm run build" and served as a static file:
 * zero work per request and cacheable on a CDN. It changes little (per season).
 */
export function seasonPage(months, { frontendUrl, generatedAt = new Date() }) {
  const body = `
<h1>Calendario de cosechas</h1>
<p class="muted">Qué estará disponible y cuándo, directamente de las fincas. Reserve antes de la cosecha.</p>
${months.map(({ month, harvests }) => `
<h2>${escapeHtml(formatMonth(month))}</h2>
${harvests.map((h) => `
<div class="card row">
  <strong>${escapeHtml(h.product)}</strong>
  <span class="chip ${escapeHtml(h.status)}">${STATUS_LABEL[h.status]}</span>
  <span class="price">${formatPrice(h.unitPrice)} / ${escapeHtml(h.unit)}</span>
  <a href="/productores/${encodeURIComponent(h.producer.id)}">${escapeHtml(h.producer.farm)} — ${escapeHtml(h.producer.village)}</a>
</div>`).join('')}`).join('') || '<p class="muted">Todavía no hay productos publicados.</p>'}
<p class="muted">Página estática generada el ${generatedAt.toISOString()} (SSG).</p>`;

  return layout({ title: 'Calendario de temporada', description: 'Calendario de cosechas por mes', body, frontendUrl });
}
