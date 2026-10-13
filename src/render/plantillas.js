/**
 * Plantillas HTML para las páginas renderizadas en el servidor (SSR) y en build (SSG).
 * Son funciones puras: datos → string. El mismo código se usa en ambos patrones.
 * El CSS va en línea (crítico y pequeño) para no gastar una petición extra en zonas rurales.
 */

export const escapar = (texto) => String(texto ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const formatoPesos = (n) => pesos.format(n);
const fechaLarga = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const formatoFecha = (iso) => fechaLarga.format(new Date(`${iso}T00:00:00Z`));
const mesLargo = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const formatoMes = (aaaaMm) => mesLargo.format(new Date(`${aaaaMm}-01T00:00:00Z`));

export const ETIQUETA_ESTADO = {
  SEMBRADO: 'Sembrado',
  EN_CRECIMIENTO: 'En crecimiento',
  DISPONIBLE: 'Disponible',
  AGOTADO: 'Agotado',
};

const ESTILOS = `
:root{--verde:#2f6b3a;--tierra:#7a4f2a;--fondo:#f7f5ef;--texto:#1f2a1f;--suave:#5d6b5d;--borde:#ddd8c8}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,sans-serif;color:var(--texto);background:var(--fondo)}
header{background:var(--verde);color:#fff;padding:12px 16px}header a{color:#fff}
main{max-width:860px;margin:0 auto;padding:16px}
h1{font-size:1.5rem;margin:.2em 0}h2{font-size:1.15rem;margin-top:1.5em}
.tarjeta{background:#fff;border:1px solid var(--borde);border-radius:10px;padding:12px 14px;margin:10px 0}
.fila{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline}
.chip{display:inline-block;padding:1px 8px;border-radius:99px;font-size:.8rem;background:#e7efe3;color:var(--verde)}
.chip.EN_CRECIMIENTO{background:#fff2d6;color:#7a5a00}.chip.SEMBRADO{background:#eee;color:#555}
.suave{color:var(--suave);font-size:.9rem}.precio{font-weight:600}
.btn{display:inline-block;background:var(--verde);color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none}
footer{color:var(--suave);font-size:.8rem;text-align:center;padding:24px}
`;

export function layout({ titulo, descripcion = '', cuerpo, frontendUrl, scripts = '' }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(titulo)} · Del Campo</title>
<meta name="description" content="${escapar(descripcion)}">
<style>${ESTILOS}</style>
</head>
<body>
<header><strong>Del Campo</strong> · <a href="${escapar(frontendUrl)}">Abrir la app</a> · <a href="/temporada/">Calendario de temporada</a></header>
<main>${cuerpo}</main>
<footer>Comercio directo campesino–consumidor · Caso de estudio 3</footer>
${scripts}
</body>
</html>`;
}

export function tarjetaCosecha(c) {
  return `<article class="tarjeta" data-cosecha="${escapar(c.id)}">
  <div class="fila">
    <strong>${escapar(c.producto)}</strong>
    <span class="chip ${escapar(c.estado)}">${ETIQUETA_ESTADO[c.estado] ?? escapar(c.estado)}</span>
    <span class="precio">${formatoPesos(c.precioUnitario)} / ${escapar(c.unidad)}</span>
  </div>
  <div class="fila suave">
    <span>Disponible desde: ${formatoFecha(c.fechaDisponible)}</span>
    <span>Libre: <b data-libre>${c.cantidadLibre}</b> de ${c.cantidadEstimada} ${escapar(c.unidad)}</span>
  </div>
  ${c.descripcion ? `<p class="suave">${escapar(c.descripcion)}</p>` : ''}
</article>`;
}
