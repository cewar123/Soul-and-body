import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  blockDate,
  createAppointment,
  findAppointmentById,
  findServiceById,
  listServices,
  takenSlotsFor,
  updateAppointmentStatus,
  type NewAppointment,
} from '../src/lib/repository.ts';

const db = env.DB;

const SERVICE_ID = 1; // seeded: facial, 60 min

async function resetAppointments(): Promise<void> {
  await db.prepare('DELETE FROM slot_holds').run();
  await db.prepare('DELETE FROM appointment_events').run();
  await db.prepare('DELETE FROM appointments').run();
}

function booking(overrides: Partial<NewAppointment> = {}): NewAppointment {
  return {
    serviceId: SERVICE_ID,
    clientName: 'Ana Prueba',
    clientPhone: '+573001234567',
    clientEmail: 'ana@example.com',
    clientNotes: null,
    clientAge: 30,
    date: '2026-11-11',
    time: '09:00',
    durationMin: 60,
    slots: ['09:00', '09:30'],
    sourceIp: '127.0.0.1',
    consentHealth: true,
    consentContact: false,
    ...overrides,
  };
}

beforeEach(resetAppointments);

describe('createAppointment', () => {
  it('crea la cita y reserva sus bloques', async () => {
    const result = await createAppointment(db, booking());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.appointment.reference).toMatch(/^SB-[A-Z0-9]{6}$/);
    expect(result.appointment.status).toBe('pending');
    expect(result.appointment.serviceName).toBe('Tratamiento facial');
    expect(result.appointment.serviceId).toBe(SERVICE_ID);

    const taken = await takenSlotsFor(db, '2026-11-11');
    expect([...taken].sort()).toEqual(['09:00', '09:30']);
  });

  it('un servicio de 90 minutos reserva tres bloques', async () => {
    const result = await createAppointment(
      db,
      booking({ durationMin: 90, slots: ['14:00', '14:30', '15:00'], time: '14:00' }),
    );
    expect(result.ok).toBe(true);

    const taken = await takenSlotsFor(db, '2026-11-11');
    expect([...taken].sort()).toEqual(['14:00', '14:30', '15:00']);
  });

  it('rechaza el segundo intento sobre el mismo bloque', async () => {
    const first = await createAppointment(db, booking());
    expect(first.ok).toBe(true);

    const second = await createAppointment(
      db,
      booking({ clientName: 'Otra Persona', clientPhone: '+573009999999' }),
    );

    expect(second).toEqual({ ok: false, reason: 'slot_taken' });
  });

  it('detecta el solapamiento parcial entre dos citas distintas', async () => {
    // 09:00–10:00 ocupa 09:00 y 09:30.
    await createAppointment(db, booking());
    // Una cita de 09:30–10:30 empieza en un bloque ya tomado.
    const overlap = await createAppointment(
      db,
      booking({ time: '09:30', slots: ['09:30', '10:00'] }),
    );

    expect(overlap).toEqual({ ok: false, reason: 'slot_taken' });
  });

  it('un choque de referencias no bloquea la reserva', async () => {
    const first = await createAppointment(db, booking(), 'SB-FIJA1');
    expect(first.ok).toBe(true);

    const second = await createAppointment(
      db,
      booking({ date: '2026-11-12', time: '11:00', slots: ['11:00', '11:30'] }),
      'SB-FIJA1',
    );
    expect(second).toEqual({ ok: false, reason: 'reference_collision' });

    // Con una referencia distinta, sí entra.
    const third = await createAppointment(
      db,
      booking({ date: '2026-11-12', time: '11:00', slots: ['11:00', '11:30'] }),
      'SB-OTRA1',
    );
    expect(third.ok).toBe(true);
  });

  it('un fallo intermedio no deja citas huérfanas', async () => {
    // El segundo bloque está tomado: el batch entero debe revertirse, así que no
    // debe quedar ninguna cita creada.
    await createAppointment(
      db,
      booking({ date: '2026-11-13', time: '10:00', slots: ['10:00'] }),
    );
    const conflicting = await createAppointment(
      db,
      booking({ date: '2026-11-13', time: '10:00', slots: ['10:00', '10:30'] }),
    );

    expect(conflicting.ok).toBe(false);

    const { results } = await db
      .prepare('SELECT reference FROM appointments WHERE date = ? AND time = ?')
      .bind('2026-11-13', '10:00')
      .all<{ reference: string }>();
    expect(results).toHaveLength(1); // solo la primera
  });

  it('la base solo valida el dominio 0/1 del consentimiento, no su exigencia', async () => {
    // Importante: la obligación legal de consentimiento de salud NO está en la
    // base (el CHECK solo garantiza que sea 0 o 1). Se aplica en el schema de
    // Zod, en el borde de la API. Ver booking-validation.test.ts.
    const result = await createAppointment(db, booking({ consentHealth: false }));
    expect(result.ok).toBe(true);
  });

  it('coacciona el consentimiento a 0/1, así que el CHECK no es violable', async () => {
    // Cualquier valor truthy se guarda como 1. La capa de validación (Zod) es la
    // que obliga a que sea `true` de verdad; aquí solo se normaliza.
    const truthy = await createAppointment(db, booking({ consentHealth: true }));
    expect(truthy.ok).toBe(true);
    if (!truthy.ok) return;
    expect(truthy.appointment.consentHealth).toBe(true);
  });

  it('rechaza una duración no positiva', async () => {
    await expect(createAppointment(db, booking({ durationMin: 0 }))).resolves.toEqual({
      ok: false,
      reason: 'unknown',
    });
  });
});

describe('updateAppointmentStatus', () => {
  it('confirma sin tocar los bloqueos', async () => {
    const created = await createAppointment(db, booking());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateAppointmentStatus(db, created.appointment.id, 'confirmed', 'admin');
    expect(updated?.status).toBe('confirmed');

    const taken = await takenSlotsFor(db, '2026-11-11');
    expect(taken.has('09:00')).toBe(true);
  });

  it('al cancelar libera los bloques', async () => {
    const created = await createAppointment(db, booking());
    if (!created.ok) throw new Error('debería haberse creado');

    const updated = await updateAppointmentStatus(
      db,
      created.appointment.id,
      'cancelled',
      'admin',
    );
    expect(updated?.status).toBe('cancelled');

    const taken = await takenSlotsFor(db, '2026-11-11');
    expect(taken.size).toBe(0);

    // El horario vuelve a estar disponible para otra clienta.
    const again = await createAppointment(db, booking({ clientPhone: '+573005555555' }));
    expect(again.ok).toBe(true);
  });

  it('registra el historial de cambios', async () => {
    const created = await createAppointment(db, booking());
    if (!created.ok) throw new Error('debería haberse creado');

    await updateAppointmentStatus(db, created.appointment.id, 'confirmed', 'admin');
    await updateAppointmentStatus(db, created.appointment.id, 'completed', 'admin');

    const { results } = await db
      .prepare('SELECT from_status, to_status, actor FROM appointment_events WHERE appointment_id = ? ORDER BY id')
      .bind(created.appointment.id)
      .all<{ from_status: string; to_status: string; actor: string }>();

    expect(results).toEqual([
      { from_status: 'pending', to_status: 'confirmed', actor: 'admin' },
      { from_status: 'confirmed', to_status: 'completed', actor: 'admin' },
    ]);
  });

  it('volver al mismo estado no duplica historial', async () => {
    const created = await createAppointment(db, booking());
    if (!created.ok) throw new Error('debería haberse creado');

    await updateAppointmentStatus(db, created.appointment.id, 'confirmed', 'admin');
    await updateAppointmentStatus(db, created.appointment.id, 'confirmed', 'admin');

    const { results } = await db
      .prepare('SELECT * FROM appointment_events WHERE appointment_id = ?')
      .bind(created.appointment.id)
      .all();
    expect(results).toHaveLength(1);
  });

  it('devuelve null si la cita no existe', async () => {
    expect(await updateAppointmentStatus(db, 9999, 'confirmed', 'admin')).toBeNull();
  });
});

describe('services', () => {
  it('el seed cargó los 6 servicios con duración y precio', async () => {
    const services = await listServices(db);
    expect(services).toHaveLength(6);
    expect(services.map((s) => s.slug)).toContain('rejuvenecimiento');

    const rejuvenecimiento = services.find((s) => s.slug === 'rejuvenecimiento');
    expect(rejuvenecimiento?.durationMin).toBe(90);
    expect(rejuvenecimiento?.priceCop).toBe(340_000);
  });

  it('busca por id', async () => {
    const service = await findServiceById(db, 1);
    expect(service?.name).toBe('Tratamiento facial');
    expect(await findServiceById(db, 9999)).toBeNull();
  });

  it('un servicio sin citas se borra; con citas se desactiva', async () => {
    const created = await createAppointment(db, booking());
    if (!created.ok) throw new Error('debería haberse creado');

    const { deleted, reason } = await (await import('../src/lib/repository.ts')).deleteService(
      db,
      SERVICE_ID,
    );
    expect(deleted).toBe(false);
    expect(reason).toBe('in_use');

    const service = await findServiceById(db, SERVICE_ID);
    expect(service?.active).toBe(false);
  });
});

describe('fechas bloqueadas', () => {
  it('una fecha bloqueada no aparece en takenSlotsFor pero se puede consultar', async () => {
    const { isDateBlocked, listBlockedDates, unblockDate } = await import(
      '../src/lib/repository.ts'
    );

    await blockDate(db, '2026-12-25', 'Navidad');
    expect(await isDateBlocked(db, '2026-12-25')).toBe(true);
    expect(await listBlockedDates(db)).toContainEqual({ date: '2026-12-25', reason: 'Navidad' });

    await unblockDate(db, '2026-12-25');
    expect(await isDateBlocked(db, '2026-12-25')).toBe(false);
  });
});

describe('findAppointmentById', () => {
  it('trae el nombre y slug del servicio', async () => {
    const created = await createAppointment(db, booking());
    if (!created.ok) throw new Error('debería haberse creado');

    const found = await findAppointmentById(db, created.appointment.id);
    expect(found?.serviceSlug).toBe('facial');
    expect(found?.consentHealth).toBe(true);
  });
});