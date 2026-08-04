-- ===========================================================================
--  Soul and Body — Esquema de base de datos (PostgreSQL / Supabase)
--  Fuente única de la estructura. Se aplica UNA vez en el SQL editor de
--  Supabase: https://app.supabase.com/project/_/sql
-- ===========================================================================

-- Habilita pgcrypto para gen_random_uuid() si decides usar UUIDs en el futuro.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Limpia objetos previos (orden: triggers → funciones → tablas).
DROP TRIGGER IF EXISTS trg_admins_updated        ON admins;
DROP TRIGGER IF EXISTS trg_customers_updated     ON customers;
DROP TRIGGER IF EXISTS trg_appointments_updated  ON appointments;
DROP TABLE    IF EXISTS appointments             CASCADE;
DROP TABLE    IF EXISTS customers                CASCADE;
DROP TABLE    IF EXISTS admins                   CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Función genérica: mantiene `updated_at` al día en cada UPDATE.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --- Administradores (panel de Wendy) --------------------------------------
CREATE TABLE admins (
  id            BIGSERIAL   PRIMARY KEY,
  username      TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_admins_updated
BEFORE UPDATE ON admins
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- --- Clientes (autoservicio) -----------------------------------------------
CREATE TABLE customers (
  id            BIGSERIAL   PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  phone         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_email ON customers (email);

CREATE TRIGGER trg_customers_updated
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- --- Citas / reservas ------------------------------------------------------
CREATE TABLE appointments (
  id          BIGSERIAL   PRIMARY KEY,
  reference   TEXT        NOT NULL UNIQUE,         -- código público, ej. SB-7Q3K2A
  name        TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  email       TEXT,                                -- opcional
  service     TEXT        NOT NULL,                -- id del servicio (ver business.js)
  date        TEXT        NOT NULL,                -- 'YYYY-MM-DD'
  time        TEXT        NOT NULL,                -- 'HH:MM' (24h)
  notes       TEXT,                                -- opcional
  status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','confirmed','cancelled','completed')),
  source_ip   TEXT,                                -- para auditoría / anti-abuso
  customer_id BIGINT      REFERENCES customers(id) ON DELETE SET NULL, -- NULL = reserva de invitada
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Impide DOS reservas activas en el mismo día y hora (a nivel de BD).
-- Índice único parcial: solo cuentan las citas que ocupan el bloque
-- (pendientes o confirmadas). Las canceladas liberan el hueco.
CREATE UNIQUE INDEX idx_appointments_slot_active
  ON appointments (date, time)
  WHERE status IN ('pending', 'confirmed');

-- Índices de apoyo para el panel de administración y "mis citas".
CREATE INDEX idx_appointments_date        ON appointments (date);
CREATE INDEX idx_appointments_status      ON appointments (status);
CREATE INDEX idx_appointments_created     ON appointments (created_at);
CREATE INDEX idx_appointments_customer_id ON appointments (customer_id);

CREATE TRIGGER trg_appointments_updated
BEFORE UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ===========================================================================
--  DESPUÉS DE EJECUTAR ESTE SCRIPT:
--  Settings → API → "service_role" key (NO la anon key) → backend/.env
--  Settings → API → "Project URL"                                → backend/.env
-- ===========================================================================
