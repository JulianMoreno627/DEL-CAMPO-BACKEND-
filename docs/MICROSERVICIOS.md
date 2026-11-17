# Microservicios: decisiones de diseño

Este documento explica **por qué** el backend quedó como está. El **qué** (estructura, servicios, cómo correrlo) está en el [README](../README.md).

## 1. Reglas de comunicación

| Desde → hacia | Protocolo | Dónde está en el código |
|---|---|---|
| Frontend → backend | **REST** (HTTP + JSON) | `infrastructure/src/gateway/` |
| Entre módulos internos | **solo gRPC sobre HTTP/2** (`@grpc/grpc-js`, contratos en `proto/*.proto`) | `services/*/src/*GrpcApi.js` (servidor) y `services/*/src/clients/` (clientes) |
| Backend → API de terceros | **solo REST** | `services/pricing-service/src/clients/`: `MarketPriceRestClient.js` (precios de mercado), `GeminiRestClient.js` y `GroqRestClient.js` (IA). pricing-service es el único servicio que habla con terceros |

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
  | user-service | `app_user`, `credential`, `user_avatar` |
  | catalog-service | `harvest`, `sync_operation`, `photo` |
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

## 8. Fotos guardadas en Neon

**Problema.** Al principio catalog-service guardaba las fotos en el disco del servidor. En Render Free ese disco **se borra cada vez que el servicio se reinicia**: en cada deploy y también cuando Render lo duerme tras 15 minutos sin tráfico. Las fotos desaparecían aunque los anuncios seguían en la base.

**Solución.**
- Las fotos se guardan en la tabla **`photo`** de Neon (`id`, `content_type`, `data BYTEA`, `size`, `created_at`), cuyo dueño es catalog-service.
- La subida no cambió: el cliente envía la foto al gateway (REST) y el gateway la reenvía a catalog-service por gRPC como `bytes`.
- Para mostrarla, el gateway atiende `/uploads/<uuid>.<ext>` llamando al RPC **`GetPhoto`** y la entrega con `Cache-Control: public, max-age=31536000, immutable`. El nombre es un uuid nuevo en cada subida, así que el contenido de una URL nunca cambia y el navegador (y el Service Worker del frontend) la guardan en caché.
- La URL es la misma de antes, así que **el frontend no cambió**.
- Al reemplazar la foto de un anuncio, o al borrar el anuncio, la foto anterior se elimina, para no llenar el almacenamiento.
- Sin `DATABASE_URL` (desarrollo y pruebas), las fotos van a una carpeta (`UPLOADS_DIR`, por defecto `data/uploads`).

**Capacidad.** Las fotos llegan comprimidas por el Web Worker del cliente (WebP de ~800 px, unos 30–80 KB, como máximo 600 KB). El plan gratuito de Neon incluye **1 GB de almacenamiento** (dato de la consola de Neon al crear el proyecto), así que alcanza para más de 10.000 fotos, descontando lo que ocupan las demás tablas.

**Las fotos subidas antes de este cambio se perdieron** con los reinicios: hay que volver a subirlas una vez.

## 9. Asistente de IA: "Publica con una foto"

**Qué hace.** El productor toma la foto de lo que cultiva y toca **"Completar con IA"**. La IA reconoce el producto y propone el nombre, la categoría, la unidad en que se vende en Colombia y una descripción corta, honesta y en español sencillo. Además, el sistema sugiere el **precio justo** con la tabla de precios de pricing-service, y avisa si la foto está oscura o borrosa. Pensado para campesinos que escriben poco o con dificultad: publicar puede ser solo tomar una foto y revisar. **La IA solo sugiere**: el productor revisa todo y nada se publica automáticamente.

**Recorrido.**
1. El frontend envía la foto (ya comprimida a WebP) a `POST /api/assistant/listing-suggestion`, por REST y solo para productores.
2. El gateway la reenvía a pricing-service por gRPC (`SuggestListing`), con la foto como `bytes`.
3. `ListingAssistantService` la envía a **Gemini** por REST. Si Gemini falla, tarda demasiado o agotó su cuota gratis, la envía a **Groq**, también por REST, sin que el productor lo note.
4. `ListingSuggestion` normaliza la respuesta: solo acepta las unidades del editor del frontend y categorías conocidas, recorta textos largos y descarta los datos si la foto no muestra un producto del campo.
5. pricing-service busca el precio justo con una comparación tolerante de nombres ("Zanahoria con hoja" → zanahoria, sin importar tildes) y lo agrega a la respuesta.

**Por qué en pricing-service y no en un servicio nuevo.**
- pricing-service ya es el servicio que habla con terceros por REST, y la sugerencia necesita el precio justo que él mismo calcula.
- Un proceso más ocuparía unos 70 MB, y en Render Free no se puede ver cuánta memoria queda.
- El contrato es un RPC propio (`SuggestListing`) y la lógica está en sus propias clases (`ListingAssistantService`, `ProductRecognizer`), así que pasarlo a un servicio aparte más adelante solo implica moverlas.

**Proveedores (probados el 16 de noviembre de 2026).**
- **Gemini, principal:** modelo `gemini-flash-lite-latest`, que ese día apuntaba a `gemini-3.5-flash-lite`. Recibe un esquema JSON estricto y respondió en 1–2 s.
- **Groq, respaldo:** modelo `qwen/qwen3.8-27b` en modo JSON, que respondió en menos de 1 s.
- Los modelos se configuran con `GEMINI_MODEL` y `GROQ_MODEL`, porque los proveedores los retiran: `gemini-2.5-flash` ya no se ofrece a cuentas nuevas, y `gemini-flash-latest` no respondió en esa prueba.
- Las claves solo llegan por variables de entorno (`GEMINI_API_KEY`, `GROQ_API_KEY`). Sin claves, el asistente queda desactivado y la app funciona igual.

**Límites y cuidado de la cuota gratis.**
- Cada productor puede usarlo 10 veces cada 10 minutos (si se pasa recibe `429`).
- Cada proveedor tiene 8 s como máximo (`AI_TIMEOUT_MS`), y la llamada completa en el gateway tiene 20 s (`AI_GATEWAY_DEADLINE_MS`).
- Los límites exactos del plan gratis de cada proveedor no están publicados de forma fija: se ven en la consola de cada uno (AI Studio y Groq).

**Privacidad.** La foto se envía a Google o a Groq para analizarla. Solo se envía la foto, nunca datos del usuario.

## 10. Otras limitaciones conocidas

- **Arranque en frío:** Render Free duerme tras 15 minutos sin tráfico. Despertar implica arrancar 7 procesos y reactivar Neon, así que la primera respuesta puede tardar de 30 a 60 s.
- **Métricas RUM en memoria:** viven en el gateway, igual que antes en el monolito, y se pierden al reiniciar.
- **Modo en memoria:** sin `DATABASE_URL`, si el supervisor reinicia un servicio, ese servicio pierde sus datos en memoria. Con Neon no pasa.
- **Validación de tipos por protobuf:** un puntaje enviado como texto (`"5"`) ahora se convierte a número, porque protobuf tipa los campos. Antes se rechazaba. El frontend siempre envía números.
