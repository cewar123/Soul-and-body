'use strict';

const db = require('../../../db/connection');
const { activeStatuses } = require('../../../config').business;

/**
 * Acceso a la tabla `appointments`. Todas las consultas usan sentencias preparadas
 * con parámetros vinculados (nunca concatenación de strings), lo que elimina
 * por completo la superficie de SQL injection.
 */

// Marcadores dinámicos para la lista de estados "activos" (?, ?...).
const activePlaceholders = activeStatuses.map(() => '?').join(', ');

const stmts = {
  insert: db.prepare(`
    INSERT INTO appointments (reference, name, phone, email, service, date, time, notes, source_ip)
    VALUES (@reference, @name, @phone, @email, @service, @date, @time, @notes, @source_ip)
  `),
  byId: db.prepare('SELECT * FROM appointments WHERE id = ?'),
  byReference: db.prepare('SELECT * FROM appointments WHERE reference = ?'),
  takenTimesForDate: db.prepare(`
    SELECT time FROM appointments
    WHERE date = ? AND status IN (${activePlaceholders})
  `),
  updateStatus: db.prepare(
    'UPDATE appointments SET status = @status WHERE id = @id'
  ),
  existsActiveSlot: db.prepare(`
    SELECT 1 FROM appointments
    WHERE date = ? AND time = ? AND status IN (${activePlaceholders})
    LIMIT 1
  `),
};

/**
 * Inserta una cita. La unicidad del bloque (día+hora activo) está garantizada
 * por un índice único parcial en la BD, así que una carrera entre dos reservas
 * simultáneas lanzará un error SQLITE_CONSTRAINT que capturamos arriba.
 */
function create(data) {
  const info = stmts.insert.run(data);
  return stmts.byId.get(info.lastInsertRowid);
}

function findById(id) {
  return stmts.byId.get(id);
}

function findByReference(reference) {
  return stmts.byReference.get(reference);
}

/** Devuelve un Set con las horas "HH:MM" ya ocupadas en una fecha. */
function takenTimes(dateStr) {
  const rows = stmts.takenTimesForDate.all(dateStr, ...activeStatuses);
  return new Set(rows.map((r) => r.time));
}

function slotIsTaken(dateStr, timeStr) {
  return Boolean(stmts.existsActiveSlot.get(dateStr, timeStr, ...activeStatuses));
}

function updateStatus(id, status) {
  return stmts.updateStatus.run({ id, status });
}

/**
 * Listado para el panel admin, con filtros opcionales. Se construye la cláusula
 * WHERE de forma segura vinculando parámetros (sin interpolar valores).
 */
function list({ status, date, from, to, q, limit = 200, offset = 0 } = {}) {
  const where = [];
  const params = [];

  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (date) {
    where.push('date = ?');
    params.push(date);
  }
  if (from) {
    where.push('date >= ?');
    params.push(from);
  }
  if (to) {
    where.push('date <= ?');
    params.push(to);
  }
  if (q) {
    where.push('(name LIKE ? OR phone LIKE ? OR email LIKE ? OR reference LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT * FROM appointments
    ${clause}
    ORDER BY date ASC, time ASC
    LIMIT ? OFFSET ?
  `;
  params.push(Math.min(Number(limit) || 200, 500), Number(offset) || 0);
  return db.prepare(sql).all(...params);
}

/** Métricas rápidas para el dashboard. */
function stats(todayStr) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM appointments').get().n;
  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM appointments WHERE status = 'pending'")
    .get().n;
  const upcoming = db
    .prepare(
      "SELECT COUNT(*) AS n FROM appointments WHERE date >= ? AND status IN ('pending','confirmed')"
    )
    .get(todayStr).n;
  const today = db
    .prepare(
      "SELECT COUNT(*) AS n FROM appointments WHERE date = ? AND status IN ('pending','confirmed')"
    )
    .get(todayStr).n;
  return { total, pending, upcoming, today };
}

module.exports = {
  create,
  findById,
  findByReference,
  takenTimes,
  slotIsTaken,
  updateStatus,
  list,
  stats,
};
