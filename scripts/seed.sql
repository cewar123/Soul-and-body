-- ===========================================================================
--  Datos iniciales de Soul and Body
--  Idempotente: se puede volver a ejecutar sin duplicar nada.
--  Ejecutar con `npm run db:seed` (local) o `npm run db:seed:remote`.
--
--  Los PRECIOS son un punto de partida razonable para Envigado y son
--  editables desde /admin/ajustes. Ojo: la Ley 1480 de 2011 (Art. 29) hace
--  vinculante lo que se publica, así que revísalos antes de abrir al público.
-- ===========================================================================

-- --- Catálogo de servicios -------------------------------------------------
INSERT INTO services (slug, name, description, duration_min, price_cop, active, sort_order)
VALUES
  ('facial', 'Tratamiento facial',
   'Limpieza profunda, exfoliación e hidratación con protocolos para una piel visiblemente más sana.',
   60, 220000, 1, 10),

  ('corporal', 'Corporal y piel firme',
   'Moldeado, firmeza y bienestar con técnica profesional y aparatología.',
   60, 260000, 1, 20),

  ('drenaje', 'Drenaje linfático',
   'Ayuda a tu cuerpo a liberar lo que retiene; descanso y ligereza reales.',
   60, 190000, 1, 30),

  ('postquirurgico', 'Postquirúrgico',
   'Acompañamiento en tu recuperación: tan importante como la cirugía misma.',
   60, 210000, 1, 40),

  ('rejuvenecimiento', 'Rejuvenecimiento',
   'Protocolos antiedad para lucir descansada y natural, sin excesos.',
   90, 340000, 1, 50),

  ('valoracion', 'Valoración personalizada',
   'Un plan a la medida de tu piel y tus objetivos, con criterio profesional.',
   30, 80000, 1, 60)
ON CONFLICT (slug) DO UPDATE SET
  name         = excluded.name,
  description  = excluded.description,
  duration_min = excluded.duration_min,
  price_cop    = excluded.price_cop,
  sort_order   = excluded.sort_order;

-- --- Ajustes del negocio ---------------------------------------------------
INSERT INTO settings (key, value) VALUES
  -- Marca y contacto (NAP: debe coincidir con Google Business Profile y redes)
  ('business.name',            'Soul and Body'),
  ('business.owner',           'Wendy de la Hoz'),
  ('business.tagline',         'Estética en Envigado'),
  ('business.phone_e164',      '+573136147706'),
  ('business.phone_display',   '313 614 7706'),
  ('business.whatsapp_e164',   '573136147706'),
  ('business.instagram',       'https://www.instagram.com/wendydelahozestetica'),
  ('business.instagram_handle','@wendydelahozestetica'),
  ('business.address',         'Cra. 43A #33 Sur-17'),
  ('business.city',            'Envigado'),
  ('business.department',      'Antioquia'),
  ('business.country',         'CO'),
  ('business.geo_lat',         '6.1719'),
  ('business.geo_lng',         '-75.5917'),
  ('business.payment_accepted','Efectivo, transferencia, Nequi, tarjeta'),

  -- Horario semanal (0 = domingo). null = cerrado.
  -- "HH:MM" en hora local de Colombia.
  ('schedule', '{"0":null,"1":{"open":"09:00","close":"18:00"},"2":{"open":"09:00","close":"18:00"},"3":{"open":"09:00","close":"18:00"},"4":{"open":"09:00","close":"18:00"},"5":{"open":"09:00","close":"18:00"},"6":{"open":"09:00","close":"18:00"}}'),

  -- Reglas de reserva
  ('booking.min_lead_minutes',  '120'),      -- 2 h de anticipación mínima
  ('booking.horizon_days',      '60'),       -- hasta 60 días vista
  ('booking.slot_quantum_min',  '30'),       -- rejilla de 30 min
  ('booking.cancellation_hours','24'),       -- cancelar con 24 h de anticipación
  ('booking.minimum_age',       '18'),       -- Ley 1799/2016: sin menores
  ('booking.buffer_minutes',    '0'),        -- descanso entre citas

  -- Notificaciones
  ('notify.email_enabled',      '1'),
  ('notify.email_recipient',    'wendy@soulandbody.co'),

  -- Seguridad / moderación
  ('admin.contact_email',       'wendy@soulandbody.co')
ON CONFLICT (key) DO UPDATE SET
  value      = excluded.value,
  updated_at = datetime('now');