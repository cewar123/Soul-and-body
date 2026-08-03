'use strict';

/**
 * Reglas de negocio de Soul and Body.
 * ---------------------------------------------------------------------------
 * Este es el ÚNICO archivo que Wendy (o quien mantenga el sitio) necesita
 * tocar para cambiar horarios, duración de citas, días de atención o el
 * catálogo de servicios. El resto del sistema deriva su comportamiento de
 * aquí, por lo que no hay valores "mágicos" repartidos por el código.
 */

module.exports = {
  brand: {
    name: 'Soul and Body',
    owner: 'Wendy de la Hoz',
    city: 'Envigado, Antioquia',
    address: 'Cra. 43A #33 Sur-17, Envigado (Antioquia)',
    shortAddress: 'Cra. 43A #33 Sur-17, Envigado',
    phone: '+573136147706',
    phoneDisplay: '313 614 7706',
    instagram: 'https://www.instagram.com/wendydelahozestetica',
    instagramHandle: '@wendydelahozestetica',
    geo: { lat: 6.1719, lng: -75.5917 },
  },

  /**
   * Horario de atención por día de la semana (0 = domingo ... 6 = sábado).
   * `open` / `close` en formato 24h "HH:MM". `null` = cerrado ese día.
   */
  schedule: {
    0: null,                          // Domingo: cerrado
    1: { open: '09:00', close: '18:00' }, // Lunes
    2: { open: '09:00', close: '18:00' }, // Martes
    3: { open: '09:00', close: '18:00' }, // Miércoles
    4: { open: '09:00', close: '18:00' }, // Jueves
    5: { open: '09:00', close: '18:00' }, // Viernes
    6: { open: '09:00', close: '18:00' }, // Sábado
  },

  /** Duración de cada cita en minutos (define el tamaño de cada bloque). */
  slotMinutes: 60,

  /**
   * Con cuánta anticipación mínima (en horas) se puede reservar.
   * Evita que alguien reserve para "dentro de 5 minutos".
   */
  minLeadTimeHours: 2,

  /** Cuántos días hacia adelante se pueden reservar. */
  bookingHorizonDays: 60,

  /**
   * Fechas bloqueadas (festivos, vacaciones). Formato "YYYY-MM-DD".
   * Ejemplo: ['2026-12-25', '2026-12-31'].
   */
  blackoutDates: [],

  /**
   * Catálogo de servicios. El `id` es lo que viaja por la API y se guarda en
   * la base de datos; el `label` es lo que ve la clienta. Mantener sincronizado
   * con la sección de servicios del frontend.
   */
  services: [
    { id: 'facial', label: 'Tratamiento facial', description: 'Limpieza profunda, hidratación y protocolos para una piel visiblemente más sana.' },
    { id: 'corporal', label: 'Corporal y piel firme', description: 'Moldeado, firmeza y bienestar con tecnología y técnica profesional.' },
    { id: 'drenaje', label: 'Drenaje linfático', description: 'Ayuda a tu cuerpo a liberar lo que retiene; descanso y ligereza reales.' },
    { id: 'postquirurgico', label: 'Postquirúrgico', description: 'Acompañamiento en tu recuperación: tan importante como la cirugía misma.' },
    { id: 'rejuvenecimiento', label: 'Rejuvenecimiento', description: 'Protocolos antiedad para lucir descansada y natural, sin excesos.' },
    { id: 'valoracion', label: 'Valoración personalizada', description: 'Un plan a la medida de tu piel y tus objetivos, con criterio profesional.' },
  ],

  /** Estados posibles de una cita. */
  statuses: ['pending', 'confirmed', 'cancelled', 'completed'],
  /** Estados que "ocupan" un bloque horario (impiden doble reserva). */
  activeStatuses: ['pending', 'confirmed'],
};
