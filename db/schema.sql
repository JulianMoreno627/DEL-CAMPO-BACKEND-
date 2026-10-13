-- Esquema objetivo para PostgreSQL + PostGIS (siguiente entrega).
-- En el Avance 1 la persistencia es en memoria detrás de la interfaz Repositorio,
-- por lo que migrar consiste en implementar RepositorioPostgres con estas tablas.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE rol_usuario     AS ENUM ('PRODUCTOR', 'COMPRADOR');
CREATE TYPE tipo_comprador  AS ENUM ('CONSUMIDOR', 'TIENDA', 'RESTAURANTE');
CREATE TYPE estado_cosecha  AS ENUM ('SEMBRADO', 'EN_CRECIMIENTO', 'DISPONIBLE', 'AGOTADO');
CREATE TYPE estado_reserva  AS ENUM ('PENDIENTE', 'CONFIRMADA', 'ENTREGADA', 'CANCELADA');

CREATE TABLE usuario (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rol            rol_usuario NOT NULL,
  nombre         TEXT NOT NULL,
  telefono       TEXT,
  ubicacion      GEOGRAPHY(POINT, 4326) NOT NULL,      -- finca o punto de entrega
  -- campos de productor
  finca          TEXT,
  vereda         TEXT,
  municipio      TEXT,
  cultivos       TEXT[] DEFAULT '{}',
  -- campos de comprador
  tipo_comprador tipo_comprador,
  version        INT NOT NULL DEFAULT 1,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (rol <> 'PRODUCTOR' OR vereda IS NOT NULL),
  CHECK (rol <> 'COMPRADOR' OR tipo_comprador IS NOT NULL)
);
-- Índice espacial: hace eficientes las consultas de "productores cercanos"
CREATE INDEX usuario_ubicacion_gix ON usuario USING GIST (ubicacion);

CREATE TABLE cosecha (
  id                 UUID PRIMARY KEY,                 -- lo genera el cliente (permite crear offline)
  productor_id       UUID NOT NULL REFERENCES usuario(id),
  producto           TEXT NOT NULL,
  categoria          TEXT NOT NULL DEFAULT 'otros',
  unidad             TEXT NOT NULL DEFAULT 'kg',
  cantidad_estimada  NUMERIC(10,2) NOT NULL CHECK (cantidad_estimada > 0),
  cantidad_reservada NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cantidad_reservada >= 0),
  precio_unitario    NUMERIC(12,2) NOT NULL CHECK (precio_unitario > 0),
  fecha_siembra      DATE,
  fecha_disponible   DATE NOT NULL,
  descripcion        TEXT DEFAULT '',
  foto               TEXT,
  estado             estado_cosecha NOT NULL DEFAULT 'SEMBRADO',
  marcas_campo       JSONB NOT NULL DEFAULT '{}',      -- última escritura por campo (resolución LWW)
  version            INT NOT NULL DEFAULT 1,
  actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cantidad_reservada <= cantidad_estimada)
);
CREATE INDEX cosecha_catalogo_ix ON cosecha (estado, fecha_disponible);

CREATE TABLE reserva (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cosecha_id      UUID NOT NULL REFERENCES cosecha(id),
  productor_id    UUID NOT NULL REFERENCES usuario(id),
  comprador_id    UUID NOT NULL REFERENCES usuario(id),
  cantidad        NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL,              -- congelado al reservar
  estado          estado_reserva NOT NULL DEFAULT 'PENDIENTE',
  version         INT NOT NULL DEFAULT 1,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE calificacion (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id     UUID NOT NULL REFERENCES reserva(id),
  de_usuario_id  UUID NOT NULL REFERENCES usuario(id),
  a_usuario_id   UUID NOT NULL REFERENCES usuario(id),
  puntajes       JSONB NOT NULL,
  comentario     TEXT DEFAULT '',
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reserva_id, de_usuario_id)                   -- una calificación por parte y por reserva
);

CREATE TABLE precio_mercado (
  producto             TEXT PRIMARY KEY,
  precio_mercado       NUMERIC(12,2) NOT NULL,
  precio_intermediario NUMERIC(12,2) NOT NULL,
  unidad               TEXT NOT NULL,
  fuente               TEXT DEFAULT 'SIPSA-DANE',
  actualizado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotencia de la sincronización offline
CREATE TABLE sync_operacion (
  op_id          TEXT PRIMARY KEY,
  dispositivo_id TEXT,
  resultado      JSONB NOT NULL,
  procesado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ejemplo: cosechas disponibles a menos de 30 km del comprador, más cercanas primero
-- SELECT c.*, ST_Distance(u.ubicacion, ST_MakePoint(-74.06, 4.65)::geography) / 1000 AS distancia_km
-- FROM cosecha c JOIN usuario u ON u.id = c.productor_id
-- WHERE c.estado <> 'AGOTADO'
--   AND ST_DWithin(u.ubicacion, ST_MakePoint(-74.06, 4.65)::geography, 30000)
-- ORDER BY distancia_km;
