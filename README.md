# Del Campo — Backend

API REST y renderizado en servidor de la **plataforma de comercialización directa campesino–consumidor** (Caso de Estudio 3, Programación Orientada a la Web).

> Frontend (PWA offline-first): repositorio `plataforma-campesino-frontend`.
> Informe del avance: [`docs/INFORME-AVANCE-1.md`](docs/INFORME-AVANCE-1.md).

## Requisitos y ejecución

- Node.js 20 o superior

```bash
npm install
npm start        # genera la página SSG y levanta la API en http://localhost:3000
npm test         # 18 pruebas (dominio, servicios, sincronización, SSR/ISR)
```

| URL | Patrón de rendering |
|---|---|
| `http://localhost:3000/temporada/` | **SSG**: HTML generado en `npm run build` |
| `http://localhost:3000/productores/p-rosa` | **SSR + ISR**: caché de 60 s e invalidación por evento |
| `http://localhost:3000/api/...` | API REST JSON que consume el frontend (CSR) |

Variables de entorno: `PORT` (3000), `FRONTEND_URL` (`http://localhost:5173`), `ORIGENES_PERMITIDOS` (CORS, separados por coma).

## Arquitectura

```
src/
├── dominio/          Entidades y reglas de negocio (POO): Cosecha (máquina de estados), Reserva,
│                     Usuario ← Productor / Comprador, Reputación, PrecioReferencia (Strategy), Coordenada
├── repositorios/     Patrón Repository: interfaz abstracta + implementación en memoria
├── servicios/        Casos de uso: Catálogo, Cosechas, Reservas, Reputación, Sync offline, Métricas
├── render/           Plantillas SSR/SSG y caché ISR
├── http/             Rutas Express y middlewares (CORS, Server-Timing, errores)
├── contenedor.js     Raíz de composición (inyección de dependencias)
└── servidor.js
scripts/build-ssg.js  Generación estática
db/schema.sql         Esquema PostgreSQL + PostGIS (siguiente entrega)
```

## Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/catalogo?lat&lng&radioKm&categoria&estado&diasMax` | Catálogo por temporada y cercanía, con evaluación de precio justo |
| GET | `/api/temporada` | Cosechas agrupadas por mes |
| GET | `/api/productores/cercanos?lat&lng&radioKm` | Fincas cercanas |
| GET | `/api/productores/:id` | Perfil, cosechas y reputación |
| GET | `/api/precios/:producto` | Precio de mercado y rango justo sugerido |
| POST/PATCH | `/api/cosechas`, `/api/cosechas/:id` | Publicar o editar una cosecha (productor) |
| POST | `/api/cosechas/:id/foto` | Foto ya comprimida en el cliente (máx. 600 KB) |
| POST | `/api/sync` | Lote de operaciones offline: idempotente, con resolución de conflictos |
| GET/POST/PATCH | `/api/reservas` | Pedidos por lote y su ciclo de vida |
| POST | `/api/calificaciones` | Reputación bidireccional |
| POST/GET | `/api/metricas`, `/api/metricas/resumen` | Web Vitals de usuarios reales (p75) |

La autenticación del Avance 1 es simulada con la cabecera `X-Usuario-Id` (usuarios demo: `p-rosa`, `p-jose`, `p-carmen`, `p-luis`, `c-ana`, `c-tienda`, `c-resto`).
