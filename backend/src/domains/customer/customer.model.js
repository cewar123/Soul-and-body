'use strict';

const supabase = require('../../db/connection');
const bcrypt = require('bcryptjs');

/**
 * Acceso a la tabla `customers` sobre Supabase.
 */

const BCRYPT_ROUNDS = 12;

async function create({ email, password, name, phone }) {
  const password_hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const { data, error } = await supabase
    .from('customers')
    .insert({ email, password_hash, name, phone })
    .select('id, email, name, phone, created_at')
    .single();
  if (error) throw error;
  return data;
}

async function findByEmail(email) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findById(id) {
  const { data, error } = await supabase
    .from('customers')
    .select('id, email, name, phone, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function verifyPassword(customer, password) {
  return bcrypt.compareSync(password, customer.password_hash);
}

async function updateProfile({ id, name, phone }) {
  const { error } = await supabase
    .from('customers')
    .update({ name, phone })
    .eq('id', id);
  if (error) throw error;
}

async function updatePassword({ id, password }) {
  const password_hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const { error } = await supabase
    .from('customers')
    .update({ password_hash })
    .eq('id', id);
  if (error) throw error;
}

module.exports = {
  create,
  findByEmail,
  findById,
  verifyPassword,
  updateProfile,
  updatePassword,
};
