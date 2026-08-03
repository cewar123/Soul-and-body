'use strict';

const db = require('../../db/connection');
const bcrypt = require('bcryptjs');

/**
 * Acceso a la tabla `customers` (clientes). Todas las consultas usan sentencias preparadas.
 */

const BCRYPT_ROUNDS = 12;

const stmts = {
  insert: db.prepare(`
    INSERT INTO customers (email, password_hash, name, phone)
    VALUES (@email, @password_hash, @name, @phone)
  `),
  byEmail: db.prepare('SELECT * FROM customers WHERE email = ?'),
  byId: db.prepare('SELECT id, email, name, phone, created_at FROM customers WHERE id = ?'),
  updateProfile: db.prepare(`
    UPDATE customers
    SET name = @name, phone = @phone, updated_at = datetime('now')
    WHERE id = @id
  `),
  updatePassword: db.prepare(`
    UPDATE customers SET password_hash = @password_hash, updated_at = datetime('now') WHERE id = @id
  `),
};

function create({ email, password, name, phone }) {
  const password_hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const info = stmts.insert.run({ email, password_hash, name, phone });
  return stmts.byId.get(info.lastInsertRowid);
}

function findByEmail(email) {
  return stmts.byEmail.get(email);
}

function findById(id) {
  return stmts.byId.get(id);
}

function verifyPassword(customer, password) {
  return bcrypt.compareSync(password, customer.password_hash);
}

function updateProfile({ id, name, phone }) {
  return stmts.updateProfile.run({ id, name, phone });
}

function updatePassword({ id, password }) {
  const password_hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  return stmts.updatePassword.run({ id, password_hash });
}

module.exports = {
  create,
  findByEmail,
  findById,
  verifyPassword,
  updateProfile,
  updatePassword,
};
