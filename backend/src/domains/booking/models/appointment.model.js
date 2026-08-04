'use strict';

const supabase = require('../../../db/connection');
const { activeStatuses } = require('../../../config').business;

/**
 * Acceso a la tabla `appointments` sobre Supabase (PostgreSQL).
 * Todas las consultas pasan por el cliente JS con service_role.
 * El índice único parcial `idx_appointments_slot_active` se define en
 * schema.sql y evita dos reservas activas en el mismo bloque.
 */

/**
 * Inserta una cita. El índice único parcial garantiza que una carrera entre
 * dos reservas simultáneas falle con un error que capturamos arriba.
 */
async function create(data) {
  const { data: row, error } = await supabase
    .from('appointments')
    .insert({
      reference: data.reference,
      name: data.name,
      phone: data.phone,
      email: data.email,
      service: data.service,
      date: data.date,
      time: data.time,
      notes: data.notes,
      source_ip: data.source_ip,
      customer_id: data.customer_id || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return row;
}

async function findById(id) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findByReference(reference) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('reference', reference)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Devuelve un Set con las horas "HH:MM" ya ocupadas en una fecha. */
async function takenTimes(dateStr) {
  const { data, error } = await supabase
    .from('appointments')
    .select('time')
    .eq('date', dateStr)
    .in('status', activeStatuses);
  if (error) throw error;
  return new Set((data || []).map((r) => r.time));
}

async function slotIsTaken(dateStr, timeStr) {
  const { data, error } = await supabase
    .from('appointments')
    .select('id')
    .eq('date', dateStr)
    .eq('time', timeStr)
    .in('status', activeStatuses)
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

async function updateStatus(id, status) {
  const { data, error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Listado para el panel admin, con filtros opcionales.
 * `q` busca en name/phone/email/reference con LIKE %x% (ilike en PG).
 */
async function list({ status, date, from, to, q, limit = 200, offset = 0 } = {}) {
  const pageSize = Math.min(Number(limit) || 200, 500);
  let query = supabase.from('appointments').select('*');
  if (status) query = query.eq('status', status);
  if (date) query = query.eq('date', date);
  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);
  if (q) {
    const like = `%${q}%`;
    query = query.or(
      `name.ilike.${like},phone.ilike.${like},email.ilike.${like},reference.ilike.${like}`,
    );
  }
  query = query
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .range(offset, offset + pageSize - 1);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Lista las citas de un cliente concreto (para "Mis citas"). */
async function listByCustomer(customerId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('customer_id', customerId)
    .order('date', { ascending: true })
    .order('time', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Métricas rápidas para el dashboard. */
async function stats(todayStr) {
  const [total, pending, upcoming, today] = await Promise.all([
    supabase.from('appointments').select('id', { count: 'exact', head: true }),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .gte('date', todayStr)
      .in('status', activeStatuses),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('date', todayStr)
      .in('status', activeStatuses),
  ]);
  for (const r of [total, pending, upcoming, today]) {
    if (r.error) throw r.error;
  }
  return {
    total: total.count || 0,
    pending: pending.count || 0,
    upcoming: upcoming.count || 0,
    today: today.count || 0,
  };
}

module.exports = {
  create,
  findById,
  findByReference,
  takenTimes,
  slotIsTaken,
  updateStatus,
  list,
  listByCustomer,
  stats,
};
