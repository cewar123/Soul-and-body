-- ===========================================================================
--  Soul and Body — Esquema inicial (SQLite / D1)
--  Migración 0001. No editar: crear 0002_*.sql para cambios posteriores.
-- ===========================================================================

-- --- Catálogo de servicios -------------------------------------------------
-- Todo el negocio es configurable desde el panel: cambiar un precio o una
-- duración NO requiere redesplegar.
CREATE TABLE services (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  duration_min INTEGER NOT NULL DEFAULT 60,
  price_cop    INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (duration_min > 0 AND duration_min <= 480),
  CHECK (price_cop >= 0),
  CHECK (active IN (0, 1))
);

CREATE INDEX idx_services_active ON services (active, sort_order);

-- --- Ajustes del negocio (clave/valor) -------------------------------------
-- Horario, anticipación, datos de contacto, políticas. Se editan en /admin.
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Administradores ------------------------------------------------------
-- Un solo usuario en el MVP. password_hash es PBKDF2-SHA256 vía WebCrypto:
--   pbkdf2$<iteraciones>$<salt base64url>$<hash base64url>
CREATE TABLE admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Días bloqueados (vacaciones, festivos) -------------------------------
CREATE TABLE blocked_dates (
  date       TEXT PRIMARY KEY,
  reason     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Citas ----------------------------------------------------------------
-- `date` y `time` se guardan en hora local de Colombia (America/Bogota, UTC-5
-- todo el año, sin horario de verano). Guardar texto local evita por completo
-- cualquier matemática de zonas horarias y hace las consultas por rango
-- triviales e indexables.
CREATE TABLE appointments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  reference        TEXT    NOT NULL UNIQUE,
  service_id       INTEGER NOT NULL REFERENCES services (id),
  client_name      TEXT    NOT NULL,
  client_phone     TEXT    NOT NULL,
  client_email     TEXT,
  client_notes     TEXT,
  client_age       INTEGER,
  date             TEXT    NOT NULL,                -- 'YYYY-MM-DD'
  time             TEXT    NOT NULL,                -- 'HH:MM'
  duration_min     INTEGER NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'pending',
  source_ip        TEXT,
  -- Consentimientos separados: la Ley 1581 de 2012 exige autorización EXPLÍCITA
  -- para datos sensibles de salud. Un checkbox de "términos" no cubre esto.
  consent_health   INTEGER NOT NULL DEFAULT 0,
  consent_contact  INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  CHECK (consent_health IN (0, 1)),
  CHECK (consent_contact IN (0, 1)),
  CHECK (length(date) = 10),
  CHECK (length(time) = 5),
  CHECK (duration_min > 0),
  CHECK (client_age IS NULL OR client_age BETWEEN 0 AND 120)
);

CREATE INDEX idx_appt_date         ON appointments (date, time);
CREATE INDEX idx_appt_status       ON appointments (status);
CREATE INDEX idx_appt_created      ON appointments (created_at);
CREATE INDEX idx_appt_service_date ON appointments (service_id, date);

-- --- Bloqueos de horario: la garantía atómica de no-doble-reserva ----------
--
-- Cada bloque de la rejilla (p.ej. 30 min) que ocupa una cita vive aquí. La
-- PRIMARY KEY compuesta hace que SQLite RECHACE el segundo INSERT del mismo
-- bloque, sin importar cuántos requests lleguen a la vez: no hay ventana de
-- carrera porque la restricción vive en el motor, no en el código de la app.
--
-- Un servicio de 90 min con rejilla de 30 ocupa 3 filas. Al cancelar o
-- completar la cita se borran sus filas y el horario vuelve a estar libre.
CREATE TABLE slot_holds (
  date           TEXT    NOT NULL,
  slot           TEXT    NOT NULL,                 -- 'HH:MM'
  appointment_id INTEGER NOT NULL REFERENCES appointments (id) ON DELETE CASCADE,
  PRIMARY KEY (date, slot)
);

CREATE INDEX idx_holds_appt ON slot_holds (appointment_id);

-- --- Historial de cambios de estado ---------------------------------------
CREATE TABLE appointment_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL REFERENCES appointments (id) ON DELETE CASCADE,
  from_status    TEXT,
  to_status      TEXT NOT NULL,
  actor          TEXT NOT NULL DEFAULT 'system',
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_appt ON appointment_events (appointment_id, created_at);

-- --- Contadores de rate limiting ------------------------------------------
-- El rate limiting en memoria no sirve en Workers (los isolates son efímeros).
-- `bucket` es 'booking:<ip>' o 'login:<ip>'; `window_start` es el timestamp
-- Unix del inicio de la ventana.
CREATE TABLE rate_limits (
  bucket       TEXT    NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX idx_rate_limits_window ON rate_limits (window_start);

-- --- updated_at automático ------------------------------------------------
-- El guard WHEN hace que un updated_at explícito desde la app gane sobre el
-- automático. recursive_triggers está OFF en D1, así que no hay recursión.
CREATE TRIGGER trg_services_updated
BEFORE UPDATE ON services
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE services SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_admins_updated
BEFORE UPDATE ON admins
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE admins SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_appointments_updated
BEFORE UPDATE ON appointments
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE appointments SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_settings_updated
BEFORE UPDATE ON settings
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE settings SET updated_at = datetime('now') WHERE key = OLD.key;
END;