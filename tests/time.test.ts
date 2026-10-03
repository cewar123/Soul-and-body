import { describe, expect, it } from 'vitest';
import {
  addDays,
  businessNow,
  dayOfWeekOf,
  diffDays,
  formatMinutes,
  humanDate,
  isValidDate,
  isValidTime,
  localDateOf,
  localMinutesOf,
  parseMinutes,
  toColombia,
} from '../src/lib/time.ts';

describe('parseMinutes / formatMinutes', () => {
  it('convierte HH:MM a minutos', () => {
    expect(parseMinutes('00:00')).toBe(0);
    expect(parseMinutes('09:30')).toBe(570);
    expect(parseMinutes('18:00')).toBe(1080);
    expect(parseMinutes('23:59')).toBe(1439);
  });

  it('convierte minutos a HH:MM', () => {
    expect(formatMinutes(0)).toBe('00:00');
    expect(formatMinutes(570)).toBe('09:30');
    expect(formatMinutes(1080)).toBe('18:00');
  });

  it('rechaza formatos inválidos', () => {
    expect(() => parseMinutes('9:30')).toThrow();
    expect(() => parseMinutes('0930')).toThrow();
    expect(() => parseMinutes('24:00')).toThrow();
    expect(() => parseMinutes('12:60')).toThrow();
    expect(() => parseMinutes('')).toThrow();
  });

  it('rechaza minutos fuera de rango', () => {
    expect(() => formatMinutes(-1)).toThrow();
    expect(() => formatMinutes(1440)).toThrow();
    expect(() => formatMinutes(10.5)).toThrow();
  });
});

describe('isValidDate', () => {
  it('acepta fechas reales', () => {
    expect(isValidDate('2026-11-10')).toBe(true);
    expect(isValidDate('2026-02-28')).toBe(true);
  });

  it('rechaza fechas que no existen', () => {
    expect(isValidDate('2026-02-31')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-00-10')).toBe(false);
    expect(isValidDate('2026-11-00')).toBe(false);
  });

  it('rechaza formatos incorrectos', () => {
    expect(isValidDate('10-11-2026')).toBe(false);
    expect(isValidDate('2026/11/10')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });

  it('acepta 29 de febrero en año bisiesto y lo rechaza si no', () => {
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
  });
});

describe('isValidTime', () => {
  it('acepta horas válidas', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
  });

  it('rechaza horas inválidas', () => {
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('12:60')).toBe(false);
    expect(isValidTime('9:00')).toBe(false);
  });
});

describe('dayOfWeekOf', () => {
  it('calcula el día de la semana (0 = domingo)', () => {
    expect(dayOfWeekOf('2026-11-08')).toBe(0); // domingo
    expect(dayOfWeekOf('2026-11-09')).toBe(1); // lunes
    expect(dayOfWeekOf('2026-11-10')).toBe(2); // martes
    expect(dayOfWeekOf('2026-11-14')).toBe(6); // sábado
  });

  it('no depende de la zona horaria del servidor', () => {
    // Si esto usara getDay() local, fallaría en UTC o en una zona al oeste.
    expect(dayOfWeekOf('2026-11-15')).toBe(0);
    expect(dayOfWeekOf('2026-01-01')).toBe(4); // jueves
  });
});

describe('addDays / diffDays', () => {
  it('suma días cruzando meses', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('salta años bisiestos', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('calcula la diferencia en días', () => {
    expect(diffDays('2026-11-10', '2026-11-10')).toBe(0);
    expect(diffDays('2026-11-10', '2026-11-17')).toBe(7);
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1);
    expect(diffDays('2026-11-17', '2026-11-10')).toBe(-7);
  });

  it('addDays y diffDays son inversos', () => {
    const start = '2026-11-10';
    expect(diffDays(start, addDays(start, 45))).toBe(45);
  });
});

describe('hora local de Colombia', () => {
  it('desplaza UTC -5 horas', () => {
    // 2026-11-10T02:00:00Z → 2026-11-09 21:00 en Bogotá
    const instant = new Date('2026-11-10T02:00:00Z');
    const local = toColombia(instant);
    expect(local.toISOString()).toBe('2026-11-09T21:00:00.000Z');
    expect(localDateOf(instant)).toBe('2026-11-09');
    expect(localMinutesOf(instant)).toBe(21 * 60);
  });

  it('un instante UTC a medianoche sigue siendo el día anterior en Bogotá', () => {
    const instant = new Date('2026-11-10T00:30:00Z');
    expect(localDateOf(instant)).toBe('2026-11-09');
  });

  it('businessNow devuelve fecha, hora y día coherentes', () => {
    // 2026-11-10T14:30:00Z → martes 10, 09:30 hora local
    const now = businessNow(new Date('2026-11-10T14:30:00Z'));
    expect(now.date).toBe('2026-11-10');
    expect(now.time).toBe('09:30');
    expect(now.minutes).toBe(570);
    expect(now.dayOfWeek).toBe(2);
  });

  it('mantiene la coherencia al cruzar medianoche', () => {
    // 2026-11-11T04:00:00Z → 2026-11-10 23:00 Bogotá
    const now = businessNow(new Date('2026-11-11T04:00:00Z'));
    expect(now.date).toBe('2026-11-10');
    expect(now.time).toBe('23:00');
    expect(now.dayOfWeek).toBe(2);
  });
});

describe('humanDate', () => {
  it('formatea en español', () => {
    expect(humanDate('2026-11-10')).toBe('martes 10 de noviembre');
    expect(humanDate('2026-01-01')).toBe('jueves 1 de enero');
    expect(humanDate('2026-07-04')).toBe('sábado 4 de julio');
  });
});