'use strict';

const supabase = require('../../db/connection');

/**
 * Acceso a la tabla `admins` sobre Supabase.
 */

async function findByUsername(username) {
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findById(id) {
  const { data, error } = await supabase
    .from('admins')
    .select('id, username, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function create({ username, passwordHash }) {
  const { error } = await supabase
    .from('admins')
    .insert({ username, password_hash: passwordHash });
  if (error) throw error;
}

async function updatePassword({ id, passwordHash }) {
  const { error } = await supabase
    .from('admins')
    .update({ password_hash: passwordHash })
    .eq('id', id);
  if (error) throw error;
}

async function count() {
  const { count, error } = await supabase
    .from('admins')
    .select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

module.exports = {
  findByUsername,
  findById,
  create,
  updatePassword,
  count,
};
