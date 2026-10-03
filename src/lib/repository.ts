/**
 * Acceso a datos. Un solo lugar donde vive cada consulta SQL.
 *
 * Nada fuera de este archivo escribe SQL. Así se puede cambiar el esquema sin
 * tocar la lógica de negocio, y los tests pueden simular D1 concentrándose en
 * este módulo.
 */

import { generateReference } from './normalize.ts';
import type { AppointmentStatus } from './config.ts';
import type { DateStr, TimeStr } from './time.ts';

// --- Servicios --------------------------------------------------------------

export interface ServiceRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  duration_min: number;
  price_cop: number;
  active: number;
  sort_order: number;
}

export interface ServiceRecord {
  id: number;
  slug: string;
  name: string;
  description: string;
  durationMin: number;
  priceCop: number;
  active: boolean;
  sortOrder: number;
}

function toService(row: ServiceRow): ServiceRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    durationMin: row.duration_min,
    priceCop: row.price_cop,
    active: row.active === 1,
    sortOrder: row.sort_order,
  };
}

export async function listServices(
  db: D1Database,
  options: { includeInactive?: boolean } = {},
): Promise<ServiceRecord[]> {
  const where = options.includeInactive ? '' : 'WHERE active = 1';
  const { results } = await db
    .prepare(`SELECT * FROM services ${where} ORDER BY sort_order, id`)
    .all<ServiceRow>();
  return results.map(toService);
}

export async function findServiceById(db: D1Database, id: number): Promise<ServiceRecord | null> {
  const row = await db.prepare('SELECT * FROM services WHERE id = ?').bind(id).first<ServiceRow>();
  return row ? toService(row) : null;
}

export async function createService(
  db: D1Database,
  input: Omit<ServiceRecord, 'id' | 'active'> & { active: boolean },
): Promise<ServiceRecord> {
  const { meta } = await db
    .prepare(
      `INSERT INTO services (slug, name, description, duration_min, price_cop, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.slug,
      input.name,
      input.description,
      input.durationMin,
      input.priceCop,
      input.active ? 1 : 0,
      input.sortOrder,
    )
    .run();

  const created = await findServiceById(db, meta.last_row_id);
  if (!created) throw new Error('No se pudo leer el servicio recién creado.');
  return created;
}

export async function updateService(
  db: D1Database,
  id: number,
  patch: Partial<Omit<ServiceRecord, 'id'>>,
): Promise<ServiceRecord | null> {
  const columns: Record<keyof Omit<ServiceRecord, 'id'>, string> = {
    slug: 'slug',
    name: 'name',
    description: 'description',
    durationMin: 'duration_min',
    priceCop: 'price_cop',
    active: 'active',
    sortOrder: 'sort_order',
  };

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, column] of Object.entries(columns) as [
    keyof Omit<ServiceRecord, 'id'>,
    string,
  ][]) {
    const value = patch[key];
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(key === 'active' ? (value ? 1 : 0) : value);
  }

  if (sets.length === 0) return findServiceById(db, id);

  values.push(id);
  await db.prepare(`UPDATE services SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  return findServiceById(db, id);
}

/**
 * Elimina un servicio solo si no tiene citas. Si ya se usó, se desactiva: perder
 * el historial de una cita real sería inaceptable.
 */
export async function deleteService(
  db: D1Database,
  id: number,
): Promise<{ deleted: boolean; reason?: 'in_use' }> {
  const service = await findServiceById(db, id);
  if (!service) return { deleted: false };

  const used = await db
    .prepare('SELECT COUNT(*) AS total FROM appointments WHERE service_id = ?')
    .bind(id)
    .first<{ total: number }>();

  if ((used?.total ?? 0) > 0) {
    await db.prepare('UPDATE services SET active = 0 WHERE id = ?').bind(id).run();
    return { deleted: false, reason: 'in_use' };
  }

  await db.prepare('DELETE FROM services WHERE id = ?').bind(id).run();
  return { deleted: true };
}

// --- Bloqueos de fecha -------------------------------------------------------

export async function listBlockedDates(db: D1Database): Promise<{ date: string; reason: string }[]> {
  const { results } = await db
    .prepare('SELECT date, reason FROM blocked_dates ORDER BY date')
    .all<{ date: string; reason: string }>();
  return results;
}

export async function isDateBlocked(db: D1Database, date: DateStr): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS hit FROM blocked_dates WHERE date = ?')
    .bind(date)
    .first<{ hit: number }>();
  return row !== null;
}

export async function blockDate(db: D1Database, date: DateStr, reason: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO blocked_dates (date, reason) VALUES (?, ?)
         ON CONFLICT (date) DO UPDATE SET reason = excluded.reason`,
    )
    .bind(date, reason)
    .run();
}

export async function unblockDate(db: D1Database, date: DateStr): Promise<void> {
  await db.prepare('DELETE FROM blocked_dates WHERE date = ?').bind(date).run();
}

// --- Ajustes -----------------------------------------------------------------

export async function saveSettings(db: D1Database, entries: Record<string, string>): Promise<void> {
  const statements = Object.entries(entries).map(([key, value]) =>
    db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      )
      .bind(key, value),
  );
  if (statements.length > 0) await db.batch(statements);
}

// --- Bloqueos de horario -----------------------------------------------------

/** Bloques ya ocupados de una fecha, como Set de 'HH:MM'. */
export async function takenSlotsFor(db: D1Database, date: DateStr): Promise<Set<TimeStr>> {
  const { results } = await db
    .prepare('SELECT slot FROM slot_holds WHERE date = ?')
    .bind(date)
    .all<{ slot: TimeStr }>();
  return new Set(results.map((row) => row.slot));
}

// --- Citas -------------------------------------------------------------------

export interface AppointmentRow {
  id: number;
  reference: string;
  service_id: number;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  client_notes: string | null;
  client_age: number | null;
  date: string;
  time: string;
  duration_min: number;
  status: AppointmentStatus;
  source_ip: string | null;
  consent_health: number;
  consent_contact: number;
  created_at: string;
  updated_at: string;
  service_name?: string;
  service_slug?: string;
}

export interface AppointmentRecord {
  id: number;
  reference: string;
  serviceId: number;
  serviceName: string;
  serviceSlug: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  clientNotes: string | null;
  clientAge: number | null;
  date: string;
  time: string;
  durationMin: number;
  status: AppointmentStatus;
  consentHealth: boolean;
  consentContact: boolean;
  createdAt: string;
  updatedAt: string;
}

function toAppointment(row: AppointmentRow): AppointmentRecord {
  return {
    id: row.id,
    reference: row.reference,
    serviceId: row.service_id,
    serviceName: row.service_name ?? '',
    serviceSlug: row.service_slug ?? '',
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email,
    clientNotes: row.client_notes,
    clientAge: row.client_age,
    date: row.date,
    time: row.time,
    durationMin: row.duration_min,
    status: row.status,
    consentHealth: row.consent_health === 1,
    consentContact: row.consent_contact === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const APPOINTMENT_SELECT = `
  SELECT a.*, s.name AS service_name, s.slug AS service_slug
    FROM appointments a
    JOIN services s ON s.id = a.service_id`;

export interface NewAppointment {
  serviceId: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  clientNotes: string | null;
  clientAge: number | null;
  date: DateStr;
  time: TimeStr;
  durationMin: number;
  slots: TimeStr[];
  sourceIp: string | null;
  consentHealth: boolean;
  consentContact: boolean;
}

/** Motivo por el que falló una inserción. */
export type CreateFailure = 'slot_taken' | 'reference_collision' | 'unknown';

export type CreateResult =
  | { ok: true; appointment: AppointmentRecord }
  | { ok: false; reason: CreateFailure };

/** ¿Es un choque de PRIMARY KEY en slot_holds? */
function isSlotConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('slot_holds') && message.includes('UNIQUE constraint failed');
}

function isReferenceConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('appointments.reference') ||
    (message.includes('UNIQUE constraint failed') && message.includes('reference'))
  );
}

/**
 * Crea una cita y reserva sus bloques en UNA única transacción atómica.
 *
 * `db.batch()` manda las sentencias juntas y D1 las ejecuta en una transacción:
 * si un INSERT falla, ninguno se aplica. Por eso:
 *
 *  · Si otro request ya tomó alguno de esos bloques → UNIQUE sobre slot_holds →
 *    `slot_taken`. La clienta recibe "ya no está disponible".
 *  · Si la referencia aleatoria choca → se reintenta con otra.
 *
 * Esta función es la ÚNICA que decide si una reserva es válida. La comprobación
 * previa de disponibilidad es solo para dar un mensaje nicer; aunque se
 * saltara, el batch seguiría rechazando la escritura.
 */
export async function createAppointment(
  db: D1Database,
  input: NewAppointment,
  reference = generateReference(),
): Promise<CreateResult> {
  const statements = [
    db
      .prepare(
        `INSERT INTO appointments (
            reference, service_id, client_name, client_phone, client_email, client_notes,
            client_age, date, time, duration_min, status, source_ip,
            consent_health, consent_contact
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .bind(
        reference,
        input.serviceId,
        input.clientName,
        input.clientPhone,
        input.clientEmail,
        input.clientNotes,
        input.clientAge,
        input.date,
        input.time,
        input.durationMin,
        input.sourceIp,
        input.consentHealth ? 1 : 0,
        input.consentContact ? 1 : 0,
      ),
    ...input.slots.map((slot) =>
      db
        .prepare(
          // Se resuelve el id por `reference` y NO con last_insert_rowid():
          // en SQLite insertar en slot_holds también mueve last_insert_rowid()
          // (esa tabla tiene rowid implícito porque su PRIMARY KEY es
          // compuesta), así que a partir del segundo bloque apuntaría a la
          // fila equivocada. `reference` es UNIQUE, así que la subconsulta
          // devuelve exactamente una fila.
          `INSERT INTO slot_holds (date, slot, appointment_id)
             VALUES (?, ?, (SELECT id FROM appointments WHERE reference = ?))`,
        )
        .bind(input.date, slot, reference),
    ),
  ];

  try {
    await db.batch(statements);
  } catch (error) {
    if (isSlotConflict(error)) return { ok: false, reason: 'slot_taken' };
    if (isReferenceConflict(error)) return { ok: false, reason: 'reference_collision' };
    console.error('[db] no se pudo crear la cita', error);
    return { ok: false, reason: 'unknown' };
  }

  const created = await findAppointmentByReference(db, reference);
  if (!created) return { ok: false, reason: 'unknown' };
  return { ok: true, appointment: created };
}

export async function findAppointmentByReference(
  db: D1Database,
  reference: string,
): Promise<AppointmentRecord | null> {
  const row = await db
    .prepare(`${APPOINTMENT_SELECT} WHERE a.reference = ?`)
    .bind(reference)
    .first<AppointmentRow>();
  return row ? toAppointment(row) : null;
}

export async function findAppointmentById(
  db: D1Database,
  id: number,
): Promise<AppointmentRecord | null> {
  const row = await db
    .prepare(`${APPOINTMENT_SELECT} WHERE a.id = ?`)
    .bind(id)
    .first<AppointmentRow>();
  return row ? toAppointment(row) : null;
}

export interface ListAppointmentsFilters {
  date?: DateStr;
  from?: DateStr;
  to?: DateStr;
  status?: AppointmentStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listAppointments(
  db: D1Database,
  filters: ListAppointmentsFilters = {},
): Promise<AppointmentRecord[]> {
  const where: string[] = [];
  const values: unknown[] = [];

  if (filters.date) {
    where.push('a.date = ?');
    values.push(filters.date);
  }
  if (filters.from) {
    where.push('a.date >= ?');
    values.push(filters.from);
  }
  if (filters.to) {
    where.push('a.date <= ?');
    values.push(filters.to);
  }
  if (filters.status) {
    where.push('a.status = ?');
    values.push(filters.status);
  }
  if (filters.search) {
    // Búsqueda por coincidencia en nombre, teléfono, correo o referencia.
    where.push('(a.client_name LIKE ? OR a.client_phone LIKE ? OR a.reference LIKE ? OR a.client_email LIKE ?)');
    const like = `%${filters.search}%`;
    values.push(like, like, like, like);
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  values.push(limit, offset);

  const sql = `
    ${APPOINTMENT_SELECT}
    ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY a.date DESC, a.time DESC
    LIMIT ? OFFSET ?`;

  const { results } = await db.prepare(sql).bind(...values).all<AppointmentRow>();
  return results.map(toAppointment);
}

/** Citas de un rango, en orden cronológico. Útil para la agenda del panel. */
export async function appointmentsInRange(
  db: D1Database,
  from: DateStr,
  to: DateStr,
): Promise<AppointmentRecord[]> {
  const { results } = await db
    .prepare(`${APPOINTMENT_SELECT} WHERE a.date BETWEEN ? AND ? ORDER BY a.date, a.time`)
    .bind(from, to)
    .all<AppointmentRow>();
  return results.map(toAppointment);
}

/**
 * Cambia el estado de una cita y libera sus bloques si deja de ocupar horario.
 *
 * Va en un batch para que no exista el instante en el que la cita figura
 * cancelada pero sus bloques siguen reservados.
 */
export async function updateAppointmentStatus(
  db: D1Database,
  id: number,
  status: AppointmentStatus,
  actor: 'admin' | 'client' | 'system',
): Promise<AppointmentRecord | null> {
  const current = await findAppointmentById(db, id);
  if (!current) return null;
  if (current.status === status) return current;

  const holdsSlot = status === 'pending' || status === 'confirmed';

  const statements = [
    db
      .prepare(
        `UPDATE appointments
            SET status = ?, updated_at = datetime('now')
          WHERE id = ?`,
      )
      .bind(status, id),
    db
      .prepare(
        `INSERT INTO appointment_events (appointment_id, from_status, to_status, actor)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(id, current.status, status, actor),
  ];

  if (!holdsSlot) {
    statements.push(db.prepare('DELETE FROM slot_holds WHERE appointment_id = ?').bind(id));
  }

  await db.batch(statements);
  return findAppointmentById(db, id);
}

export async function appointmentEvents(
  db: D1Database,
  id: number,
): Promise<{ from_status: string | null; to_status: string; actor: string; created_at: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT from_status, to_status, actor, created_at
         FROM appointment_events WHERE appointment_id = ?
        ORDER BY created_at, id`,
    )
    .bind(id)
    .all<{ from_status: string | null; to_status: string; actor: string; created_at: string }>();
  return results;
}

// --- Administradores ---------------------------------------------------------

export async function findAdminByUsername(
  db: D1Database,
  username: string,
): Promise<{ id: number; username: string; password_hash: string } | null> {
  return db
    .prepare('SELECT id, username, password_hash FROM admins WHERE username = ?')
    .bind(username.toLowerCase())
    .first<{ id: number; username: string; password_hash: string }>();
}

export async function updateAdminPassword(
  db: D1Database,
  id: number,
  passwordHash: string,
): Promise<void> {
  await db
    .prepare("UPDATE admins SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(passwordHash, id)
    .run();
}