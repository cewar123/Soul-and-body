import { describe, expect, it } from 'vitest';
import {
  availabilityQuerySchema,
  bookingBodySchema,
  changePasswordBodySchema,
  loginBodySchema,
  serviceBodySchema,
  settingsBodySchema,
} from '../src/lib/validation.ts';

const validBooking = {
  serviceId: 1,
  date: '2026-11-11',
  time: '09:00',
  name: 'ana maría pérez',
  phone: '300 123 4567',
  email: 'Ana@Example.COM',
  notes: 'Primera vez',
  age: 30,
  consentHealth: true,
  consentContact: true,
  turnstileToken: 'token',
};

describe('bookingBodySchema', () => {
  it('acepta una reserva válida y normaliza los campos', () => {
    const parsed = bookingBodySchema.parse(validBooking);

    expect(parsed.name).toBe('Ana María Pérez');
    expect(parsed.phone).toBe('+573001234567');
    expect(parsed.email).toBe('ana@example.com');
    expect(parsed.consentHealth).toBe(true);
  });

  it('hace opcionales el correo y el comentario', () => {
    const { email: _e, notes: _n, ...rest } = validBooking;
    const parsed = bookingBodySchema.parse(rest);
    expect(parsed.email).toBe('');
    expect(parsed.notes).toBeNull();
  });

  it('exige consentimiento explícito de datos de salud', () => {
    const result = bookingBodySchema.safeParse({ ...validBooking, consentHealth: false });
    expect(result.success).toBe(false);

    const missing = bookingBodySchema.safeParse({ ...validBooking, consentHealth: undefined });
    expect(missing.success).toBe(false);

    // Y el mensaje explica por qué.
    const parsed = bookingBodySchema.safeParse({ ...validBooking, consentHealth: false });
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/autorizaci/i);
    }
  });

  it('el consentimiento de contacto sí es opcional', () => {
    const { consentContact: _c, ...rest } = validBooking;
    expect(bookingBodySchema.parse(rest).consentContact).toBe(false);
  });

  it('rechaza fechas y horas imposibles', () => {
    expect(bookingBodySchema.safeParse({ ...validBooking, date: '2026-02-31' }).success).toBe(false);
    expect(bookingBodySchema.safeParse({ ...validBooking, date: '11/11/2026' }).success).toBe(false);
    expect(bookingBodySchema.safeParse({ ...validBooking, time: '25:00' }).success).toBe(false);
    expect(bookingBodySchema.safeParse({ ...validBooking, time: '9:00' }).success).toBe(false);
  });

  it('rechaza teléfonos no colombianos', () => {
    expect(bookingBodySchema.safeParse({ ...validBooking, phone: '123' }).success).toBe(false);
    expect(bookingBodySchema.safeParse({ ...validBooking, phone: '9991234567' }).success).toBe(false);
  });

  it('rechaza correos mal formados', () => {
    expect(bookingBodySchema.safeParse({ ...validBooking, email: 'no-es-correo' }).success).toBe(false);
    expect(bookingBodySchema.safeParse({ ...validBooking, email: 'a@b' }).success).toBe(false);
  });

  it('acepta nombre demasiado corto', () => {
    const result = bookingBodySchema.safeParse({ ...validBooking, name: 'A' });
    expect(result.success).toBe(false);
  });

  it('acepta la edad como string (viene de un <input>)', () => {
    const parsed = bookingBodySchema.parse({ ...validBooking, age: '30' });
    expect(parsed.age).toBe(30);
  });

  it('rechaza edades imposibles', () => {
    expect(bookingBodySchema.safeParse({ ...validBooking, age: -1 }).success).toBe(false);
    expect(bookingBodySchema.safeParse({ ...validBooking, age: 200 }).success).toBe(false);
  });

  it('trunca comentarios desatentos en vez de rechazarlos', () => {
    const parsed = bookingBodySchema.parse({ ...validBooking, notes: 'a'.repeat(2000) });
    expect(parsed.notes).toHaveLength(800);
  });
});

describe('availabilityQuerySchema', () => {
  it('acepta service + date válidos y coacciona el id', () => {
    const parsed = availabilityQuerySchema.parse({ service: '3', date: '2026-11-11' });
    expect(parsed.service).toBe(3);
  });

  it('rechaza una fecha inválida', () => {
    expect(availabilityQuerySchema.safeParse({ service: 1, date: '2026-13-01' }).success).toBe(false);
  });

  it('rechaza un id no numérico', () => {
    expect(availabilityQuerySchema.safeParse({ service: 'abc', date: '2026-11-11' }).success).toBe(
      false,
    );
  });
});

describe('loginBodySchema', () => {
  it('baja el usuario a minúsculas', () => {
    expect(loginBodySchema.parse({ username: '  WENDY ', password: 'ClaveSegura1' }).username).toBe(
      'wendy',
    );
  });

  it('exige contraseña de al menos 8 caracteres', () => {
    expect(loginBodySchema.safeParse({ username: 'wendy', password: 'corta' }).success).toBe(false);
  });
});

describe('changePasswordBodySchema', () => {
  it('exige 12 caracteres con mezcla de letras y números', () => {
    expect(
      changePasswordBodySchema.safeParse({
        currentPassword: 'ViejaClave123',
        newPassword: 'corta1A',
      }).success,
    ).toBe(false);

    expect(
      changePasswordBodySchema.safeParse({
        currentPassword: 'ViejaClave123',
        newPassword: 'soletodoenminusculas1',
      }).success,
    ).toBe(false);

    expect(
      changePasswordBodySchema.safeParse({
        currentPassword: 'ViejaClave123',
        newPassword: 'SINNUMEROSQUEDACONTRASENA',
      }).success,
    ).toBe(false);

    expect(
      changePasswordBodySchema.safeParse({
        currentPassword: 'ViejaClave123',
        newPassword: 'NuevaClaveSegura1',
      }).success,
    ).toBe(true);
  });

  it('exige que la nueva sea distinta de la actual', () => {
    expect(
      changePasswordBodySchema.safeParse({
        currentPassword: 'NuevaClaveSegura1',
        newPassword: 'NuevaClaveSegura1',
      }).success,
    ).toBe(false);
  });
});

describe('serviceBodySchema', () => {
  const base = {
    slug: 'drenaje-linfatico',
    name: 'Drenaje linfático',
    description: 'Ayuda al cuerpo a liberar lo que retiene.',
    durationMin: 60,
    priceCop: 190000,
    active: true,
    sortOrder: 30,
  };

  it('acepta un servicio válido', () => {
    expect(serviceBodySchema.parse(base).priceCop).toBe(190_000);
  });

  it('exige un slug en minúsculas y con guiones', () => {
    expect(serviceBodySchema.safeParse({ ...base, slug: 'Drenaje Linfático' }).success).toBe(false);
    expect(serviceBodySchema.safeParse({ ...base, slug: 'drenaje--doble' }).success).toBe(false);
    expect(serviceBodySchema.safeParse({ ...base, slug: '-invalido' }).success).toBe(false);
  });

  it('acota duración y precio', () => {
    expect(serviceBodySchema.safeParse({ ...base, durationMin: 5 }).success).toBe(false);
    expect(serviceBodySchema.safeParse({ ...base, durationMin: 999 }).success).toBe(false);
    expect(serviceBodySchema.safeParse({ ...base, priceCop: -1 }).success).toBe(false);
  });
});

describe('settingsBodySchema', () => {
  it('serializa el horario semanal a JSON', () => {
    const parsed = settingsBodySchema.parse({
      schedule: {
        '0': null,
        '1': { open: '09:00', close: '18:00' },
      },
    });
    expect(JSON.parse(parsed.schedule ?? '{}')).toEqual({
      '0': null,
      '1': { open: '09:00', close: '18:00' },
    });
  });

  it('rechaza un día con cierre anterior a la apertura', () => {
    const result = settingsBodySchema.safeParse({
      schedule: { '1': { open: '18:00', close: '09:00' } },
    });
    expect(result.success).toBe(false);
  });

  it('acepta domingo cerrado', () => {
    expect(settingsBodySchema.safeParse({ schedule: { '0': null } }).success).toBe(true);
  });

  it('valida coordenadas', () => {
    expect(settingsBodySchema.safeParse({ 'business.geo_lat': 95 }).success).toBe(false);
    expect(settingsBodySchema.safeParse({ 'business.geo_lat': 6.1719 }).success).toBe(true);
  });

  it('solo permite quantum de rejilla útil', () => {
    expect(settingsBodySchema.safeParse({ 'booking.slot_quantum_min': 45 }).success).toBe(false);
    expect(settingsBodySchema.safeParse({ 'booking.slot_quantum_min': 30 }).success).toBe(true);
  });
});