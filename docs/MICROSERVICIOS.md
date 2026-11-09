# Microservicios: decisiones de diseño

Este documento explica **por qué** el backend quedó como está. El **qué** (estructura, servicios, cómo correrlo) está en el [README](../README.md).

## 1. Reglas de comunicación

| Desde → hacia | Protocolo | Dónde está en el código |
|---|---|---|
| Frontend → backend | **REST** (HTTP + JSON) | `infrastructure/src/gateway/` |
| Entre módulos internos | **solo gRPC sobre HTTP/2** (`@grpc/grpc-js`, contratos en `proto/*.proto`) | `services/*/src/*GrpcApi.js` (servidor) y `services/*/src/clients/` (clientes) |
| Backend → API de terceros | **solo REST** | `services/pricing-service/src/clients/MarketPriceRestClient.js` (el único) |

- Ningún servicio importa código de otro servicio ni consulta tablas de otro servicio: solo usa sus clientes gRPC. Lo único compartido es `packages/shared`, que no tiene lógica de negocio.
- Dentro de cada servicio, `<Name>GrpcApi.js` es el **único archivo que conoce gRPC**. Convierte mensaje → DTO y llama al `controller`; el controller llama al `service` y devuelve un DTO.
- El gateway (`infrastructure`) no tiene lógica de negocio. Cada controller suyo solo traduce REST ↔ gRPC, y `restMappers.js` reconstruye **exactamente** el JSON que devolvía la API antes de la migración.

Paridad verificada: se enviaron las mismas 71 peticiones al monolito anterior y al gateway nuevo (escenarios exitosos, errores 400/401/403/404/409/413/422, la página SSR y la redirección). Coincidieron en estado HTTP y cuerpo. La única diferencia es intencional: `/api/health` ahora también informa el estado de cada servicio, de la base y la memoria.

## 2. Un solo proceso padre en Render Free

**Problema.** En Render Free, un Web Service gratis puede **enviar** tráfico por la red privada, pero **no recibirlo**. Además, el proxy público de Render reenvía HTTP/1.1, y gRPC necesita HTTP/2 de punta a punta. Por eso no funciona desplegar seis servicios gratis separados que se llamen por gRPC.

**Solución.**
- En Render hay **un solo Web Service**.
- El módulo `infrastructure` (orquestador) arranca cada microservicio como un **proceso hijo independiente** (`child_process.fork`), con su propio puerto gRPC en `127.0.0.1`.
- Solo `infrastructure` escucha en `PORT`, el puerto público. Los puertos gRPC no son accesibles desde internet.
- `ServiceSupervisor`:
  - espera a que cada servicio responda el **Health Checking Protocol** de gRPC antes de abrir el puerto público;
  - reinicia un servicio caído con backoff exponencial (1 s, 2 s, 4 s… hasta 30 s);
  - con SIGTERM los apaga en orden inverso.
- Si el proceso padre muere, los hijos se cierran solos al perder el canal IPC, así que no quedan procesos huérfanos ocupando puertos.

**En producción real**, cada servicio sería un contenedor aparte (por ejemplo, un Deployment de Kubernetes por servicio) y las direcciones `*_GRPC_PORT`/`GRPC_HOST` apuntarían a cada uno. La separación lógica, los contratos `.proto` y la comunicación por gRPC no cambiarían: solo cambia quién arranca los procesos.

### Memoria (512 MB del plan gratis)

Se midió en desarrollo (Windows, Node 24), leyendo `/api/health`:

| Configuración | RSS por microservicio |
|---|---|
| Sin flags | ~60 MB |
| `--max-old-space-size=64 --max-semi-space-size=1` (por defecto) | ~54 MB al arrancar, ~58 MB tras uso |
| Además `--lite-mode` | ~49 MB (JIT más lento) |

Total con los flags por defecto: 6 × ~58 MB + el gateway (~80 MB), unos **430 MB**.

- Entra en 512 MB, pero con poco margen. En Linux (Render) Node suele ocupar algo menos.
- Hay que confirmarlo en producción con `/api/health` y la pestaña **Metrics** de Render.
- Si se acerca al límite, se agrega `--lite-mode` a `SERVICE_NODE_FLAGS`.
- `--max-old-space-size` también limita cada heap, para que un servicio con fugas no se lleve la memoria de los demás.

## 3. Una sola base de datos (Neon)

- Es **una sola base PostgreSQL en Neon** (plan Free) y no una por servicio, porque es una demo.
- Para mantener los límites entre servicios, **cada servicio solo lee y escribe sus tablas**:

  | Servicio | Tablas |
  |---|---|
  | user-service | `app_user`, `credential` |
  | catalog-service | `harvest`, `sync_operation` |
  | cart-service | `cart` |
  | order-service | `purchase_order` |
  | reputation-service | `rating` |
  | pricing-service | `market_price` |

- **El esquema lo ejecuta `infrastructure` una vez al arrancar**, antes de los servicios, y no cada servicio su parte. Hay tres razones:
  1. Hay llaves foráneas entre tablas de distintos dueños (por ejemplo `harvest.producer_id → app_user`), así que el orden de creación importa.
  2. Se evita que 6 procesos ejecuten DDL al mismo tiempo.
  3. `db/schema.sql` es idempotente (`IF NOT EXISTS`) y queda en un solo lugar.

  Esas llaves foráneas se mantienen porque es una sola base; con una base por servicio se quitarían.
- **Conexiones:**
  - Se usa la cadena **con pooling** de Neon (PgBouncer).
  - Cada servicio tiene un pool pequeño (`DB_POOL_MAX=3`), es decir, 18 conexiones como máximo más 1 del gateway.
  - El pool tiene timeouts y un manejador de errores, porque Neon cierra las conexiones al suspenderse.
  - La conexión inicial se reintenta con backoff, porque la primera consulta despierta a Neon.
- **SSL:** se configura explícitamente en `packages/shared/src/db/postgres.js`. Se verifica el certificado, que en Neon es público y válido, y se usa *channel binding* cuando la URL lo pide.
- Se mantiene el **control de concurrencia optimista** (`version`, `updated_at`). Un conflicto llega al frontend como `409` con `type: "VersionConflict"` y el registro actual en `current`, igual que antes.
- **Sin `DATABASE_URL`**, cada servicio usa repositorios en memoria (desarrollo y pruebas). El archivo `data/db.json` del monolito ya no se usa, porque seis procesos no pueden compartir un archivo JSON. Para tener persistencia en desarrollo se apunta `DATABASE_URL` a una rama de Neon.

## 4. Casos que cruzan servicios

1. **Checkout como saga** (`order-service/src/service/CheckoutSaga.js`). Lo orquesta order-service, que es el dueño de los pedidos:
   1. Lee el carrito (cart-service, `GetCartItems`).
   2. Por cada producto, reserva la cantidad (catalog-service, `ReserveHarvest`) y guarda el pedido con el precio congelado.
   3. Vacía el carrito (cart-service, `EmptyCart`).

   Si cualquier paso falla, **compensa** en orden inverso: borra los pedidos creados y libera las reservas (`ReleaseHarvest`), con 3 intentos por compensación. El carrito queda intacto y el comprador recibe el error original (por ejemplo, `409 Solo quedan 5 kg libres`).

   **Limitación:** sin transacciones distribuidas, esto no es atómico. Si catalog-service sigue caído durante la compensación, queda en el log `saga compensation failed (release N of X) request=<id>` para corregirlo a mano.
2. **Calificaciones.** reputation-service pide el pedido a order-service (`GetOrder`) y comprueba que existe, que el usuario es una de sus partes y que `completed` es verdadero. Los criterios los define el usuario calificado (`GetUser` → `ratingCriteria`), que es el polimorfismo Producer/Buyer.
3. **Borrar un anuncio.** Solo se puede si no tiene pedidos: catalog-service pregunta a order-service (`HasOrdersForHarvest`). Cuenta también los pedidos cancelados, que se conservan como historial. Esto además corrige un caso del monolito: con PostgreSQL, borrar un anuncio cuyos pedidos estaban todos cancelados fallaba con un error 500 por la llave foránea.
4. **Precio justo en el catálogo.** catalog-service evalúa todos los precios en **una sola** llamada (`EvaluatePrices`). Si pricing-service no responde, el catálogo se muestra igual, con `NO_REFERENCE`.
5. **Datos del productor** en el catálogo y en `/productores/:id`: catalog-service los pide a user-service (`ListProducers`, `GetUser`).

Las reglas de negocio no se duplican entre servicios: el servicio dueño las calcula y las publica en el mensaje. Por ejemplo, `Harvest.accepts_reservations` (catalog) y `Order.completed` (order).

## 5. Autenticación en el gateway

- user-service **emite** el token (HMAC-SHA256) y guarda las contraseñas con scrypt.
- El gateway lo **verifica localmente** con el mismo `TOKEN_SECRET`, que es la opción (a). Se eligió en vez de llamar a `user.ValidateToken` en cada petición porque:
  - no agrega una llamada gRPC ni su latencia a cada petición;
  - si user-service está reiniciándose, las demás rutas siguen funcionando;
  - el token ya era *stateless* (firma y vencimiento) y no había revocación, así que no se pierde nada.
- El gateway pasa `x-user-id`, `x-user-role` y `x-request-id` en la metadata gRPC.
- `requireUser` y `requireRole` siguen en el gateway, y el login sigue exigiendo el perfil correcto.
- **Confianza:** los servicios confían en la metadata porque solo escuchan en `127.0.0.1`. Con contenedores separados habría que usar mTLS o firmar la metadata.

## 6. ISR con stream gRPC

catalog-service publica cada cambio de cosecha de su `EventBus` (patrón Observer) en el stream server-side `WatchHarvestChanges`. El gateway se suscribe (`HarvestChangeSubscriber`) e invalida `/productores/:id`. Si el stream se corta, se reconecta con backoff y limpia toda la caché, porque pudo perder eventos mientras estaba desconectado. El TTL de 60 s sigue como respaldo.

## 7. API externa de precios (REST)

- Se buscó una fuente **REST pública y gratuita** de SIPSA (DANE):
  - Las entradas de SIPSA en **datos.gov.co** son enlaces federados, no datos tabulares. Su API Socrata responde `"no row or column access to non-tabular tables"` (se probó con `gkqq-k3k5` y `ymnp-apvk`).
  - El servicio web oficial del DANE para SIPSA es **SOAP**, no REST.
- Por eso **no se fijó ninguna URL**. `MarketPriceRestClient` (detrás de la interfaz `MarketPriceProvider`) se activa con `MARKET_PRICES_API_URL`, con timeout y caché de 6 h.
- Mientras no haya una fuente REST, se usan los precios guardados en `market_price`. La primera vez se cargan los valores ilustrativos que ya tenía el proyecto, con `source = 'DEMO'`, para que nadie los confunda con datos oficiales.
- Si la fuente externa falla, también se usan los últimos precios guardados.

## 8. Fotos (pendiente de decisión)

- Hoy catalog-service guarda las fotos en disco (`UPLOADS_DIR`) y el gateway las sirve en `/uploads`. **En Render Free el disco es efímero: las fotos se pierden en cada deploy.** No se cambió.
- **Propuesta:** una tabla `photo` (`id`, `content_type`, `data BYTEA`, `created_at`) cuyo dueño sea catalog-service, más un RPC `GetPhoto` que el gateway expone en `/uploads/:id` con `Cache-Control` largo.
  - Las fotos ya llegan comprimidas por el Web Worker del cliente (WebP de ~800 px, unos 30–80 KB), así que el almacenamiento gratuito de Neon alcanza para miles de fotos.
  - Antes de decidir, conviene revisar el límite actual del plan en la consola de Neon.
  - Alternativa: un almacenamiento de objetos con plan gratuito, consultado por REST desde catalog-service.

## 9. Otras limitaciones conocidas

- **Arranque en frío:** Render Free duerme tras 15 minutos sin tráfico. Despertar implica arrancar 7 procesos y reactivar Neon, así que la primera respuesta puede tardar de 30 a 60 s.
- **Métricas RUM en memoria:** viven en el gateway, igual que antes en el monolito, y se pierden al reiniciar.
- **Modo en memoria:** sin `DATABASE_URL`, si el supervisor reinicia un servicio, ese servicio pierde sus datos en memoria. Con Neon no pasa.
- **Validación de tipos por protobuf:** un puntaje enviado como texto (`"5"`) ahora se convierte a número, porque protobuf tipa los campos. Antes se rechazaba. El frontend siempre envía números.
