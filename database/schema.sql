-- ===========================================================================
--  Soul and Body — Esquema de base de datos (SQLite)
--  Fuente única de la estructura. Se aplica con: npm run migrate
-- ===========================================================================

-- --- Usuarios administradores ---------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- --- Clientes (clientes finales) -----------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  phone         TEXT,                              -- opcional
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);

-- Mantiene updated_at al día automáticamente en cada UPDATE.
CREATE TRIGGER IF NOT EXISTS trg_customers_updated
AFTER UPDATE ON customers
FOR EACH ROW
BEGIN
  UPDATE customers SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- --- Citas / reservas ------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reference   TEXT    NOT NULL UNIQUE,          -- código público, ej. SB-7Q3K2A
  name        TEXT    NOT NULL,
  phone       TEXT    NOT NULL,
  email       TEXT,                             -- opcional
  service     TEXT    NOT NULL,                 -- id del servicio (ver business.js)
  date        TEXT    NOT NULL,                 -- 'YYYY-MM-DD'
  time        TEXT    NOT NULL,                 -- 'HH:MM' (24h)
  notes       TEXT,                             -- opcional
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','confirmed','cancelled','completed')),
  source_ip   TEXT,                             -- para auditoría / anti-abuso
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Impide DOS reservas activas en el mismo día y hora (a nivel de base de datos,
-- no solo de aplicación). Un índice único parcial: solo cuentan las citas que
-- ocupan el bloque (pendientes o confirmadas). Las canceladas liberan el hueco.
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_slot_active
  ON appointments (date, time)
  WHERE status IN ('pending', 'confirmed');

-- Índices de apoyo para las consultas del panel de administración.
CREATE INDEX IF NOT EXISTS idx_appointments_date   ON appointments (date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments (status);
CREATE INDEX IF NOT EXISTS idx_appointments_created ON appointments (created_at);

-- Mantiene updated_at al día automáticamente en cada UPDATE.
CREATE TRIGGER IF NOT EXISTS trg_appointments_updated
AFTER UPDATE ON appointments
FOR EACH ROW
BEGIN
  UPDATE appointments SET updated_at = datetime('now') WHERE id = OLD.id;
END;
