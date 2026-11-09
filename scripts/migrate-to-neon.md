# Migrar los datos de la base de Render a Neon

Esta guía copia **los datos actuales** (cuentas, anuncios, carritos, pedidos y calificaciones) desde la base PostgreSQL de Render hacia Neon. **No la ejecuta nadie automáticamente**: se hace a mano, una sola vez, **antes** de cambiar `DATABASE_URL` en Render.

> Hazlo con la base de Neon **vacía**. Si el backend ya arrancó contra Neon, ya creó las tablas y las cuentas demo, y la restauración chocaría con esas filas. En ese caso, usa la opción `--clean --if-exists` del paso 4.

## 1. Requisitos

- **Herramientas de cliente de PostgreSQL** (`pg_dump` y `pg_restore`) en una versión **igual o mayor** que la del servidor de Render.
  - Windows: instalador oficial de <https://www.postgresql.org/download/windows/>. En el instalador marca solo **Command Line Tools**.
  - Comprueba la versión con `pg_dump --version`.
- Dos cadenas de conexión (son secretos: no las pegues en chats ni las subas a git):
  - **Render**: en el panel de la base de datos de Render, la **External Database URL**.
  - **Neon**: en la consola de Neon, botón **Connect**, la cadena **sin pooling** (directa: el host NO lleva `-pooler`). `pg_restore` no debe pasar por PgBouncer; el backend, en cambio, sí usa la cadena con pooling.

## 2. Guardar las cadenas en variables (PowerShell)

```powershell
$RENDER_URL = "postgresql://...render.com/...?sslmode=require"   # External Database URL
$NEON_DIRECT_URL = "postgresql://...neon.tech/neondb?sslmode=require" # sin -pooler
```

## 3. Exportar desde Render

```powershell
pg_dump --format=custom --no-owner --no-acl --verbose --dbname "$RENDER_URL" --file delcampo.dump
```

`--no-owner` y `--no-acl` evitan errores, porque el usuario de Neon no se llama igual que el de Render.

## 4. Importar en Neon

```powershell
pg_restore --no-owner --no-acl --verbose --dbname "$NEON_DIRECT_URL" delcampo.dump
```

Si Neon ya tenía las tablas (por ejemplo, porque el backend arrancó antes contra Neon):

```powershell
pg_restore --clean --if-exists --no-owner --no-acl --verbose --dbname "$NEON_DIRECT_URL" delcampo.dump
```

## 5. Verificar

En la consola de Neon, en el **SQL Editor**, compara con la misma consulta en la base de Render:

```sql
SELECT 'app_user' AS tabla, count(*) FROM app_user
UNION ALL SELECT 'credential', count(*) FROM credential
UNION ALL SELECT 'harvest', count(*) FROM harvest
UNION ALL SELECT 'purchase_order', count(*) FROM purchase_order
UNION ALL SELECT 'cart', count(*) FROM cart
UNION ALL SELECT 'rating', count(*) FROM rating
UNION ALL SELECT 'sync_operation', count(*) FROM sync_operation
UNION ALL SELECT 'market_price', count(*) FROM market_price;
```

Los números deben coincidir.

## 6. Después

- Borra el archivo `delcampo.dump`: contiene los hashes de las contraseñas.
- Sigue con [`docs/DESPLIEGUE.md`](../docs/DESPLIEGUE.md): cambiar `DATABASE_URL` en Render.
- Mantén el **mismo `TOKEN_SECRET`** que ya tenía Render, para que las sesiones abiertas sigan siendo válidas.
- No borres la base de Render hasta comprobar que todo funciona con Neon.

## Alternativa sin herramientas locales

Si no quieres instalar las herramientas de PostgreSQL, pgAdmin hace lo mismo con una interfaz gráfica:

1. Conecta las dos bases (Render y Neon directa).
2. Haz **Backup** de la de Render en formato *Custom*.
3. Haz **Restore** en la de Neon, con las opciones *Do not save → Owner* y *Privileges* activadas.
