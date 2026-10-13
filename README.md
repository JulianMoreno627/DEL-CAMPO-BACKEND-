# Del Campo — Backend

API REST y renderizado en servidor de la **plataforma de comercialización directa campesino–consumidor** (Caso de Estudio 3, Programación Orientada a la Web).

> Frontend: [DEL-CAMPO-FRONTEND](https://github.com/JulianMoreno627/DEL-CAMPO-FRONTEND).
> Informe del avance 1: [`docs/INFORME-AVANCE-1.md`](docs/INFORME-AVANCE-1.md) (describe la versión de ese avance, con los nombres de entonces).

El código (clases, funciones, variables, archivos, rutas de la API y comentarios) está en inglés; los textos que ve el usuario están en español.

## Requisitos y ejecución

- Node.js 20 o superior

```bash
npm install
npm start        # genera la página SSG y levanta la API en http://localhost:3000
npm test         # 27 pruebas (dominio, servicios, login, anuncios, carrito, persistencia, sincronización, SSR/ISR)
```

| URL | Patrón de rendering |
|---|---|
| `http://localhost:3000/temporada/` | **SSG**: HTML generado en `npm run build` |
| `http://localhost:3000/productores/p-rosa` | **SSR + ISR**: caché de 60 s e invalidación por evento |
| `http://localhost:3000/api/...` | API REST JSON que consume el frontend (CSR) |

Variables de entorno: `PORT` (3000), `FRONTEND_URL` (`http://localhost:5173`), `ALLOWED_ORIGINS` (CORS, separados por coma), `TOKEN_SECRET` (firma de las sesiones), `DATA_PATH` (archivo de datos, por defecto `data/db.json`), `UPLOADS_DIR` (carpeta de fotos, por defecto `public/uploads`).

## Arquitectura

```
src/
├── domain/           Entidades y reglas de negocio (POO): Harvest (máquina de estados), Order, Cart,
│                     User ← Producer / Buyer, Reputation, FairPrice (Strategy), Coordinate
├── repositories/     Patrón Repository: interfaz abstracta, InMemoryRepository y JsonPersistence (guardado en disco)
├── services/         Casos de uso: Auth, Listing, Cart, Order, Catalog, Harvest, Reputation, Sync, Metrics
├── render/           Plantillas SSR/SSG y caché ISR
├── http/             Rutas Express y middlewares (CORS, sesión, Server-Timing, errores)
├── data/seed.js      Cuentas de demostración y datos de ejemplo para las pruebas
├── container.js      Raíz de composición (inyección de dependencias)
└── server.js
scripts/build-ssg.js  Generación estática
db/schema.sql         Esquema PostgreSQL + PostGIS (siguiente entrega)
```

## Perfiles e inicio de sesión

Al iniciar sesión se elige el perfil:

- **Productor** (`PRODUCER`): publica anuncios de lo que cultiva (producto, descripción, precio, cantidad y foto) y ve sus pedidos.
- **Comprador** (`BUYER`): ve los anuncios (solo con el precio que fijó el productor), los agrega al carrito y compra. Cada producto comprado se convierte en un pedido para su productor.

La sesión es un token firmado (HMAC-SHA256) que el cliente envía en `Authorization: Bearer <token>`. Las contraseñas se guardan con scrypt.

No hay productos de ejemplo: la tienda empieza vacía y solo muestra lo que publican los productores. Los datos (cuentas, productos, carritos y pedidos) se guardan en `data/db.json`, así que no se pierden al reiniciar el servidor; para empezar de cero basta con borrar ese archivo. Las pruebas automáticas usan sus propios datos de ejemplo en memoria.

## Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Crear cuenta: `{ role: 'PRODUCER'\|'BUYER', name, email, password }` → `{ token, user }` |
| POST | `/api/auth/login` | `{ email, password, role }` → `{ token, user }` (rechaza si el perfil elegido no es el de la cuenta) |
| GET | `/api/auth/me` | Usuario de la sesión actual |
| GET | `/api/listings?q=` | Anuncios a la venta (precio, cantidad disponible, productor) |
| GET | `/api/listings/mine` | Anuncios del productor, con lo vendido (productor) |
| POST/PATCH/DELETE | `/api/listings`, `/api/listings/:id` | Publicar, editar o eliminar un anuncio sin pedidos (productor) |
| POST | `/api/listings/:id/photo` | Foto del anuncio, ya comprimida en el cliente (productor) |
| GET/DELETE | `/api/cart` | Ver o vaciar el carrito (comprador) |
| POST | `/api/cart/items` | Agregar `{ listingId, quantity }` |
| PATCH/DELETE | `/api/cart/items/:listingId` | Cambiar cantidad (0 = quitar) o quitar |
| POST | `/api/cart/checkout` | Convierte el carrito en pedidos; si un producto ya no alcanza no se compra nada |
| GET/POST/PATCH | `/api/orders` | Pedidos y su ciclo de vida (`PENDING → CONFIRMED → DELIVERED`, o `CANCELLED`) |
| POST | `/api/ratings` | Reputación bidireccional |
| GET | `/api/catalog?lat&lng&radiusKm&category&status&maxDays` | Catálogo por temporada y cercanía, con evaluación de precio justo |
| GET | `/api/season` | Cosechas agrupadas por mes |
| GET | `/api/producers/nearby?lat&lng&radiusKm` | Fincas cercanas |
| GET | `/api/producers/:id` | Perfil, cosechas y reputación |
| GET | `/api/prices/:product` | Precio de mercado y rango justo sugerido |
| POST/PATCH | `/api/harvests`, `/api/harvests/:id` | Publicar o editar una cosecha (productor) |
| POST | `/api/sync` | Lote de operaciones offline: idempotente, con resolución de conflictos |
| POST/GET | `/api/metrics`, `/api/metrics/summary` | Web Vitals de usuarios reales (p75) |

Las rutas de escritura requieren la sesión.
