/**
 * HTML templates for the pages rendered on the server (SSR) and at build time (SSG).
 * They are pure functions: data → string. The same code is used by both patterns.
 * CSS is inlined (critical and small) to avoid an extra request on rural connections.
 * The visible text stays in Spanish.
 */

export const escapeHtml = (text) => String(text ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const formatPrice = (n) => copFormatter.format(n);
const longDate = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const formatDate = (iso) => longDate.format(new Date(`${iso}T00:00:00Z`));
const longMonth = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const formatMonth = (yyyyMm) => longMonth.format(new Date(`${yyyyMm}-01T00:00:00Z`));

/** Labels shown to the user for each status code. */
export const STATUS_LABEL = {
  PLANTED: 'Sembrado',
  GROWING: 'En crecimiento',
  AVAILABLE: 'Disponible',
  SOLD_OUT: 'Agotado',
};

export const LEVEL_LABEL = {
  NEW: 'Nuevo',
  TRUSTED: 'Confiable',
  REGULAR: 'Regular',
  AT_RISK: 'En riesgo',
};

const STYLES = `
:root{--green:#2f6b3a;--soil:#7a4f2a;--background:#f7f5ef;--text:#1f2a1f;--muted:#5d6b5d;--border:#ddd8c8}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,sans-serif;color:var(--text);background:var(--background)}
header{background:var(--green);color:#fff;padding:12px 16px}header a{color:#fff}
main{max-width:860px;margin:0 auto;padding:16px}
h1{font-size:1.5rem;margin:.2em 0}h2{font-size:1.15rem;margin-top:1.5em}
.card{background:#fff;border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin:10px 0}
.row{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline}
.chip{display:inline-block;padding:1px 8px;border-radius:99px;font-size:.8rem;background:#e7efe3;color:var(--green)}
.chip.GROWING{background:#fff2d6;color:#7a5a00}.chip.PLANTED{background:#eee;color:#555}
.muted{color:var(--muted);font-size:.9rem}.price{font-weight:600}
.btn{display:inline-block;background:var(--green);color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none}
footer{color:var(--muted);font-size:.8rem;text-align:center;padding:24px}
`;

export function layout({ title, description = '', body, frontendUrl, scripts = '' }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Del Campo</title>
<meta name="description" content="${escapeHtml(description)}">
<style>${STYLES}</style>
</head>
<body>
<header><strong>Del Campo</strong> · <a href="${escapeHtml(frontendUrl)}">Abrir la app</a> · <a href="/temporada/">Calendario de temporada</a></header>
<main>${body}</main>
<footer>Comercio directo campesino–consumidor · Caso de estudio 3</footer>
${scripts}
</body>
</html>`;
}

export function harvestCard(h) {
  return `<article class="card" data-harvest="${escapeHtml(h.id)}">
  <div class="row">
    <strong>${escapeHtml(h.product)}</strong>
    <span class="chip ${escapeHtml(h.status)}">${STATUS_LABEL[h.status] ?? escapeHtml(h.status)}</span>
    <span class="price">${formatPrice(h.unitPrice)} / ${escapeHtml(h.unit)}</span>
  </div>
  <div class="row muted">
    <span>Disponible desde: ${formatDate(h.availableOn)}</span>
    <span>Libre: <b data-free>${h.freeQuantity}</b> de ${h.estimatedQuantity} ${escapeHtml(h.unit)}</span>
  </div>
  ${h.description ? `<p class="muted">${escapeHtml(h.description)}</p>` : ''}
</article>`;
}
