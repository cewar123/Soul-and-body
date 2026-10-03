import { describe, expect, it } from 'vitest';
import {
  availableSlots,
  bookableRange,
  blockRange,
  blocksNeeded,
  gridFor,
  rejectionReason,
  windowForDay,
  type SlotPolicy,
} from '../src/lib/slots.ts';
import { localDateOf, localMinutesOf, type DayWindow } from '../src/lib/time.ts';

/** Lunes a sábado 09:00–18:00, domingo cerrado. */
const SCHEDULE: Record<string, DayWindow | null> = {
  '0': null,
  '1': { open: '09:00', close: '18:00' },
  '2': { open: '09:00', close: '18:00' },
  '3': { open: '09:00', close: '18:00' },
  '4': { open: '09:00', close: '18:00' },
  '5': { open: '09:00', close: '18:00' },
  '6': { open: '09:00', close: '18:00' },
};

const POLICY: SlotPolicy = {
  quantumMin: 30,
  bufferMin: 0,
  minLeadMinutes: 120,
  horizonDays: 60,
};

// 2026-11-09 es lunes, 2026-11-11 miércoles, 2026-11-15 domingo (futuro).
const WED = '2026-11-11';
const MONDAY = '2026-11-09';
const SUNDAY_BEFORE = '2026-11-08';
const SUNDAY_AFTER = '2026-11-15';

describe('blocksNeeded', () => {
  it('redondea hacia arriba al múltiplo de la rejilla', () => {
    expect(blocksNeeded(30, POLICY)).toBe(1);
    expect(blocksNeeded(60, POLICY)).toBe(2);
    expect(blocksNeeded(90, POLICY)).toBe(3);
    expect(blocksNeeded(100, POLICY)).toBe(4);
    expect(blocksNeeded(120, POLICY)).toBe(4);
  });

  it('incluye el buffer de separación', () => {
    expect(blocksNeeded(60, { ...POLICY, bufferMin: 15 })).toBe(3);
    expect(blocksNeeded(60, { ...POLICY, bufferMin: 30 })).toBe(3);
  });

  it('rechaza valores no positivos', () => {
    expect(() => blocksNeeded(0, POLICY)).toThrow();
    expect(() => blocksNeeded(60, { ...POLICY, quantumMin: 0 })).toThrow();
  });
});

describe('blockRange', () => {
  it('devuelve los inicios consecutivos de bloque', () => {
    expect(blockRange('09:00', 3, POLICY)).toEqual(['09:00', '09:30', '10:00']);
    expect(blockRange('17:00', 2, POLICY)).toEqual(['17:00', '17:30']);
  });

  it('respeta una rejilla de 15 minutos', () => {
    const p: SlotPolicy = { ...POLICY, quantumMin: 15 };
    expect(blockRange('09:00', 4, p)).toEqual(['09:00', '09:15', '09:30', '09:45']);
  });
});

describe('gridFor', () => {
  it('genera la rejilla de un día 09:00–18:00', () => {
    const grid = gridFor({ open: '09:00', close: '18:00' }, 30);
    expect(grid).toHaveLength(18);
    expect(grid[0]).toBe('09:00');
    expect(grid.at(-1)).toBe('17:30');
  });

  it('devuelve vacío si el cierre no es posterior a la apertura', () => {
    expect(gridFor({ open: '18:00', close: '09:00' }, 30)).toEqual([]);
    expect(gridFor({ open: '09:00', close: '09:00' }, 30)).toEqual([]);
  });
});

describe('availableSlots', () => {
  const base = {
    date: WED,
    policy: POLICY,
    window: { open: '09:00', close: '18:00' },
    now: new Date('2026-11-10T02:00:00Z'), // martes 21:00 hora local
    taken: new Set<string>(),
  };

  it('ofrece todos los bloques si el día está libre', () => {
    const slots = availableSlots({ ...base, durationMin: 60 });
    expect(slots).toHaveLength(17); // 09:00..17:00; 17:30 no cabe una hora
    expect(slots[0]).toBe('09:00');
    expect(slots.at(-1)).toBe('17:00');
  });

  it('deja fuera el último bloque si el servicio no cabe antes del cierre', () => {
    const slots = availableSlots({ ...base, durationMin: 60 });
    expect(slots).not.toContain('17:30');
  });

  it('un servicio de 90 minutos ofrece menos horarios', () => {
    const slots = availableSlots({ ...base, durationMin: 90 });
    expect(slots).toHaveLength(16);
    expect(slots.at(-1)).toBe('16:30');
  });

  it('excluye los bloques ya ocupados', () => {
    const taken = new Set(['10:00', '10:30']);
    const slots = availableSlots({ ...base, durationMin: 60, taken });
    expect(slots).not.toContain('09:30'); // 09:30+10:00 chocaría
    expect(slots).not.toContain('10:00');
    expect(slots).toContain('11:00');
    expect(slots).toContain('09:00');
  });

  it('detecta solapamiento parcial con una cita más larga', () => {
    // Alguien tiene 09:00–10:30 (60 min desde 09:00 ocupa 09:00 y 09:30).
    const taken = new Set(['09:00', '09:30']);
    const slots = availableSlots({ ...base, durationMin: 60, taken });
    // 08:30 no existe; 10:00 sí está libre.
    expect(slots).not.toContain('08:30');
    expect(slots).toContain('10:00');
  });

  it('devuelve vacío si el día está cerrado', () => {
    expect(availableSlots({ ...base, date: SUNDAY_AFTER, window: null, durationMin: 60 })).toEqual([]);
  });

  it('devuelve vacío si el día no alcanza para la duración', () => {
    const slots = availableSlots({
      ...base,
      window: { open: '09:00', close: '09:40' },
      durationMin: 60,
    });
    expect(slots).toEqual([]);
  });

  it('nunca ofrece una cita que termine después del cierre', () => {
    // Cierre 17:50: un bloque de 17:30 existe en la rejilla, pero una cita de
    // 60 min terminaría a las 18:30, fuera de horario.
    const slots = availableSlots({
      ...base,
      window: { open: '09:00', close: '17:50' },
      durationMin: 60,
    });
    expect(slots.at(-1)).toBe('16:30');
    expect(slots).not.toContain('17:00');
  });

  it('respeta la anticipación mínima el mismo día', () => {
    // 2026-11-11T13:00:00Z = miércoles 08:00 en Bogotá.
    const slots = availableSlots({
      ...base,
      now: new Date('2026-11-11T13:00:00Z'),
      durationMin: 60,
    });
    // 08:00 + 2 h = 10:00 → primer bloque 10:00
    expect(slots[0]).toBe('10:00');
    expect(slots).not.toContain('09:30');
  });

  it('no ofrece nada si ya no da tiempo hoy', () => {
    // 17:00 en Bogotá, cierre 18:00, 2 h de anticipación → nada.
    const slots = availableSlots({
      ...base,
      now: new Date('2026-11-11T22:00:00Z'),
      durationMin: 60,
    });
    expect(slots).toEqual([]);
  });

  it('un día futuro ofrece el día completo sin importar la hora actual', () => {
    // Martes 23:30 en Bogotá: el miércoles sigue entero disponible.
    const slots = availableSlots({
      ...base,
      now: new Date('2026-11-11T04:30:00Z'),
      durationMin: 60,
    });
    expect(slots[0]).toBe('09:00');
    expect(slots).toHaveLength(17);
  });

  it('el buffer impide horarios demasiado seguidos', () => {
    const policy: SlotPolicy = { ...POLICY, bufferMin: 30 };
    // 09:00–10:00 ocupado.
    const taken = new Set(['09:00', '09:30']);
    const slots = availableSlots({ ...base, policy, durationMin: 60, taken });
    // 10:00 está libre pero la cita de 10:00 + 30 de buffer invadiría 10:30–11:00.
    // Con buffer, los bloques que hay que libres son 3: 10:00, 10:30 y 11:00.
    expect(slots).toContain('10:00');
    // Si a las 11:00 hubiera algo, 10:00 ya no valdría.
    const tighter = availableSlots({
      ...base,
      policy,
      durationMin: 60,
      taken: new Set(['09:00', '09:30', '11:00']),
    });
    expect(tighter).not.toContain('10:00');
    expect(tighter).toContain('11:30');
  });
});

describe('rejectionReason', () => {
  const now = new Date('2026-11-11T13:00:00Z'); // miércoles 08:00 local
  const window = { open: '09:00', close: '18:00' };

  it('acepta hoy y los próximos días dentro del horizonte', () => {
    expect(rejectionReason('2026-11-11', now, POLICY, window)).toBeNull();
    expect(rejectionReason('2026-11-12', now, POLICY, window)).toBeNull();
  });

  it('rechaza fechas pasadas', () => {
    expect(rejectionReason('2026-11-10', now, POLICY, window)).toMatch(/pasó/i);
  });

  it('rechaza días cerrados', () => {
    expect(rejectionReason(SUNDAY_AFTER, now, POLICY, null)).toMatch(/No atendemos/i);
  });

  it('rechaza fechas fuera del horizonte', () => {
    const far = '2027-01-15';
    expect(rejectionReason(far, now, POLICY, window)).toMatch(/60 días/i);
  });
});

describe('windowForDay', () => {
  it('devuelve la ventana del día correcto', () => {
    expect(windowForDay(SCHEDULE, MONDAY)).toEqual({ open: '09:00', close: '18:00' });
    expect(windowForDay(SCHEDULE, WED)).toEqual({ open: '09:00', close: '18:00' });
  });

  it('devuelve null en domingo', () => {
    expect(windowForDay(SCHEDULE, SUNDAY_BEFORE)).toBeNull();
  });
});

describe('bookableRange', () => {
  it('incluye hoy y tantos días como el horizonte', () => {
    const now = new Date('2026-11-11T13:00:00Z');
    const range = bookableRange(now, 60);
    expect(range).toHaveLength(61);
    expect(range[0]).toBe('2026-11-11');
    expect(range.at(-1)).toBe('2027-01-10');
  });
});

describe('localDateOf / localMinutesOf', () => {
  it('interpreta el instante en hora de Colombia', () => {
    // Medianoche UTC todavía es el día anterior en Bogotá.
    expect(localDateOf(new Date('2026-11-11T00:00:00Z'))).toBe('2026-11-10');
    expect(localDateOf(new Date('2026-11-11T05:00:00Z'))).toBe('2026-11-11');
    expect(localMinutesOf(new Date('2026-11-11T14:30:00Z'))).toBe(9 * 60 + 30);
  });
});