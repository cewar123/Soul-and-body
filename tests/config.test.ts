import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  formatPrice,
  loadSiteConfig,
  localIso,
  toE164,
  whatsappLink,
} from '../src/lib/config.ts';

const db = env.DB;

describe('loadSiteConfig', () => {
  it('conserva la precisión decimal de las coordenadas', () => {
    // parseInt('6.1719') devolvería 6 y mandaría el negocio al centro de la
    // ciudad en vez de a su dirección exacta.
    return expect(loadSiteConfig(db)).resolves.toMatchObject({
      business: { geoLat: 6.1719, geoLng: -75.5917 },
    });
  });

  it('lee el horario semanal como ventana por día', async () => {
    const config = await loadSiteConfig(db);
    expect(config.schedule['0']).toBeNull();
    expect(config.schedule['1']).toEqual({ open: '09:00', close: '18:00' });
    expect(config.schedule['6']).toEqual({ open: '09:00', close: '18:00' });
  });

  it('devuelve solo los servicios activos, ordenados', async () => {
    const config = await loadSiteConfig(db);
    expect(config.services).toHaveLength(6);
    expect(config.services[0]?.slug).toBe('facial');
    expect(config.services.map((s) => s.durationMin)).toContain(90);
  });

  it('aplica los valores por defecto de la política', async () => {
    const config = await loadSiteConfig(db);
    expect(config.policy).toMatchObject({
      minLeadMinutes: 120,
      horizonDays: 60,
      slotQuantumMin: 30,
      cancellationHours: 24,
      minimumAge: 18,
    });
  });
});

describe('formatPrice', () => {
  it('formatea pesos colombianos sin decimales', () => {
    expect(formatPrice(220_000)).toContain('220');
    expect(formatPrice(220_000)).toContain('000');
    expect(formatPrice(0)).toContain('0');
  });
});

describe('toE164', () => {
  it('normaliza a E.164', () => {
    expect(toE164('313 614 7706')).toBe('+573136147706');
    expect(toE164('+57 313 614 7706')).toBe('+573136147706');
  });

  it('usa el respaldo si no hay dígitos suficientes', () => {
    expect(toE164('123', '+573000000000')).toBe('+573000000000');
  });
});

describe('whatsappLink', () => {
  it('construye el enlace con el mensaje prellenado y codificado', () => {
    const link = whatsappLink('573136147706', 'Hola, quiero agendar Facial');
    expect(link).toBe('https://wa.me/573136147706?text=Hola%2C%20quiero%20agendar%20Facial');
  });
});

describe('localIso', () => {
  it('marca el desfuso de Colombia (-05:00)', () => {
    expect(localIso('2026-11-11', '09:00')).toBe('2026-11-11T09:00:00-05:00');
  });
});