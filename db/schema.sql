-- PostgreSQL schema for Del Campo backend.
-- Uses plain lat/lng (DOUBLE PRECISION) instead of PostGIS so it runs on any
-- Postgres instance (including Render's free tier). Distance is computed in JS
-- (Haversine) in PostgresUserRepository.nearbyProducers.

-- "user" is a reserved word in PostgreSQL, hence app_user
CREATE TABLE IF NOT EXISTS app_user (
  id          TEXT PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('PRODUCER', 'BUYER')),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  -- producer fields
  farm        TEXT,
  village     TEXT,
  town        TEXT,
  crops       TEXT[] NOT NULL DEFAULT '{}',
  -- buyer fields
  buyer_type  TEXT CHECK (buyer_type IN ('CONSUMER', 'STORE', 'RESTAURANT')),
  version     INT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role <> 'BUYER' OR buyer_type IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS app_user_role_idx ON app_user (role);

-- Credentials apart from the profile: the hash never travels with the user data
CREATE TABLE IF NOT EXISTS credential (
  email    TEXT PRIMARY KEY,
  user_id  TEXT NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
  salt     BYTEA NOT NULL,
  hash     BYTEA NOT NULL
);

-- A producer's listing is stored as a harvest
CREATE TABLE IF NOT EXISTS harvest (
  id                  TEXT PRIMARY KEY,
  producer_id         TEXT NOT NULL REFERENCES app_user(id),
  product             TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'other',
  unit                TEXT NOT NULL DEFAULT 'kg',
  estimated_quantity  NUMERIC(10,2) NOT NULL CHECK (estimated_quantity > 0),
  reserved_quantity   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  unit_price          NUMERIC(12,2) NOT NULL CHECK (unit_price > 0),
  planted_on          DATE,
  available_on        DATE NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  photo               TEXT,
  status              TEXT NOT NULL DEFAULT 'PLANTED',
  field_timestamps    JSONB NOT NULL DEFAULT '{}',
  version             INT NOT NULL DEFAULT 1,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reserved_quantity <= estimated_quantity)
);
CREATE INDEX IF NOT EXISTS harvest_catalog_ix ON harvest (status, available_on);
CREATE INDEX IF NOT EXISTS harvest_producer_ix ON harvest (producer_id);

-- "order" is a reserved word in PostgreSQL, hence purchase_order
CREATE TABLE IF NOT EXISTS purchase_order (
  id          TEXT PRIMARY KEY,
  harvest_id  TEXT NOT NULL REFERENCES harvest(id),
  producer_id TEXT NOT NULL REFERENCES app_user(id),
  buyer_id    TEXT NOT NULL REFERENCES app_user(id),
  quantity    NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(12,2) NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING',
  version     INT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_order_buyer_ix ON purchase_order (buyer_id);
CREATE INDEX IF NOT EXISTS purchase_order_producer_ix ON purchase_order (producer_id);

-- Shopping cart: one row per buyer; items stored as JSONB
CREATE TABLE IF NOT EXISTS cart (
  buyer_id    TEXT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  items       JSONB NOT NULL DEFAULT '[]',
  version     INT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rating (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES purchase_order(id),
  from_user_id  TEXT NOT NULL REFERENCES app_user(id),
  to_user_id    TEXT NOT NULL REFERENCES app_user(id),
  scores        JSONB NOT NULL,
  comment       TEXT NOT NULL DEFAULT '',
  version       INT NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, from_user_id)
);
CREATE INDEX IF NOT EXISTS rating_to_user_ix ON rating (to_user_id);

-- Idempotency of the offline synchronization
CREATE TABLE IF NOT EXISTS sync_operation (
  op_id         TEXT PRIMARY KEY,
  device_id     TEXT,
  result        JSONB NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Market prices (reference for fair-price evaluation)
CREATE TABLE IF NOT EXISTS market_price (
  product          TEXT PRIMARY KEY,
  market_price     NUMERIC(12,2) NOT NULL,
  middleman_price  NUMERIC(12,2) NOT NULL,
  unit             TEXT NOT NULL,
  source           TEXT DEFAULT 'SIPSA-DANE',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
