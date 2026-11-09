# Despliegue: Render (backend) + Neon (base de datos)

Estos pasos son **manuales** y los hace el dueño de las cuentas. Están ordenados para que la aplicación en producción no deje de funcionar en ningún momento: primero se mueve la base y después se cambia el código.

El frontend (Vercel) **no cambia**: sigue apuntando a `https://del-campo-backend.onrender.com`.

---

## Paso 1. Crear la base en Neon

1. Entra a <https://console.neon.tech> e inicia sesión.
2. Haz clic en **New Project** y llena:
   - **Name:** `del-campo`.
   - **Cloud provider:** **AWS**.
   - **Region:** **AWS US West 2 (Oregon)**. Es la misma región del servicio de Render (*Oregon (US West)*), así la latencia entre el backend y la base es mínima.
   - **Postgres version:** la que venga por defecto.
3. Cuando se cree, haz clic en **Connect** y copia **dos** cadenas:
   - **Con pooling** (el host contiene `-pooler`). Es la que usa el backend en `DATABASE_URL`.
   - **Sin pooling** (directa). Solo se usa para migrar datos con `pg_restore`.

   Las dos terminan en `?sslmode=require&channel_binding=require`. Son secretos: no se pegan en chats ni se suben a git.

**Opcional (recomendado):** en Neon, en **Branches**, crea una rama llamada `pruebas`. Sirve para correr `npm run test:db` sin tocar los datos reales.

## Paso 2. Migrar los datos actuales

Sigue [`scripts/migrate-to-neon.md`](../scripts/migrate-to-neon.md): `pg_dump` desde Render y `pg_restore` hacia la cadena **directa** de Neon. Comprueba al final que los conteos de cada tabla coinciden.

## Paso 3 (opcional). Probar los repositorios contra Neon desde tu computador

1. Crea en la raíz del repositorio un archivo `.env.test`. No se sube a git: está en `.gitignore`.

   ```
   TEST_DATABASE_URL=<cadena con pooling de la rama "pruebas">
   ```
2. Ejecuta:

   ```bash
   npm run test:db
   ```

Las dos pruebas de PostgreSQL deben pasar. Si las ejecutas contra la rama principal, crearán usuarios y anuncios de prueba; por eso conviene usar la rama `pruebas`.

## Paso 4. Apuntar Render a Neon

En <https://dashboard.render.com>, abre el servicio **DEL-CAMPO-BACKEND-** y ve a **Environment**:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La cadena **con pooling** de Neon (rama principal). Reemplaza la de la base de Render. |
| `TOKEN_SECRET` | Si ya existe, **no la cambies**: así las sesiones abiertas siguen siendo válidas. Si no existe, créala con `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. |
| `FRONTEND_URL` | La URL de Vercel del frontend. |
| `ALLOWED_ORIGINS` | La misma URL de Vercel (si hay varias, separadas por coma). |
| `NODE_VERSION` | `22` |

Guarda los cambios con **Save Changes**. Render redespliega con el código que está hoy en `main` (el monolito), que también funciona sobre Neon porque el esquema es el mismo.

Abre `https://del-campo-backend.onrender.com/api/health` y entra al frontend: los datos migrados deben aparecer. Si algo falla, vuelve a poner la `DATABASE_URL` anterior.

## Paso 5. Configurar el build y el arranque de los microservicios

En **Settings**, en la sección **Build & Deploy**:

| Campo | Valor |
|---|---|
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `npm start` |
| **Health Check Path** | Déjalo vacío. Si pones `/api/health`, cada chequeo consulta la base y mantiene despierto el cómputo de Neon, lo que gasta horas del plan gratis. |

Agrega también en **Environment**, por claridad, aunque ya tienen esos valores por defecto:

| Variable | Valor |
|---|---|
| `DB_POOL_MAX` | `3` |
| `GRPC_DEADLINE_MS` | `5000` |
| `SERVICE_NODE_FLAGS` | `--max-old-space-size=64 --max-semi-space-size=1` |

> `render.yaml` contiene esta misma configuración, pero Render solo lo lee si el servicio se crea como *Blueprint*. Como el servicio ya existe, se configura a mano.

## Paso 6. Publicar el código de microservicios

El código está en la rama `feature/microservices`. Para desplegarlo hay que unirlo a `main` (merge), porque Render despliega `main`. **Esto se hace solo cuando lo autorices**: Render despliega automáticamente al recibir el cambio.

## Paso 7. Verificar en producción

1. `https://del-campo-backend.onrender.com/api/health` debe responder `200` con:
   - `"ok": true`;
   - los 6 servicios en `"SERVING"`;
   - `"database": "UP"`;
   - la memoria de cada proceso en `memory`.
2. **Metrics** en Render: el uso de memoria debe quedar por debajo de 512 MB.
   - Si se acerca al límite, agrega `--lite-mode` a `SERVICE_NODE_FLAGS`, que ahorra unos 5 MB por servicio.
3. **Logs** en Render: deben aparecer las 6 líneas `gRPC (HTTP/2) en 127.0.0.1:5005x` y luego `API Gateway (REST) en ...`.
4. En el frontend (Vercel):
   - inicia sesión como productor y como comprador;
   - publica un anuncio, agrégalo al carrito y compra;
   - confirma y entrega el pedido.
5. Abre `https://del-campo-backend.onrender.com/temporada/` (SSG) y `https://del-campo-backend.onrender.com/productores/p-rosa` (SSR + ISR).

## Si algo sale mal

- **Volver a la versión anterior:** en Render, pestaña **Events** o **Deploys**, elige el deploy anterior y usa **Rollback**.
- **Volver a la base anterior:** pon otra vez la `DATABASE_URL` de Render. No borres esa base hasta comprobar que todo funciona con Neon.
- **La primera petición tarda:** Render Free duerme el servicio tras 15 minutos sin tráfico y Neon suspende la base tras unos minutos sin uso. Al despertar hay que arrancar 7 procesos y reactivar Neon: la primera respuesta puede tardar de 30 a 60 segundos. Las siguientes son normales.
