'use strict';

const db = require('../../db/connection');

/**
 * Acceso a la tabla `admins`. Todas las consultas usan sentencias preparadas
 * con parámetros vinculados (nunca concatenación de strings), lo que elimina
 * por completo la superficie de SQL injection.
 */

const stmts = {
  findByUsername: db.prepare('SELECT * FROM admins WHERE username = ?'),
  findById: db.prepare('SELECT id, username, created_at FROM admins WHERE id = ?'),
  insert: db.prepare(
    'INSERT INTO admins (username, password_hash) VALUES (@username, @password_hash)'
  ),
  updatePassword: db.prepare(
    "UPDATE admins SET password_hash = @password_hash, updated_at = datetime('now') WHERE id = @id"
  ),
  count: db.prepare('SELECT COUNT(*) AS n FROM admins'),
};

module.exports = {
  findByUsername: (username) => stmts.findByUsername.get(username),
  findById: (id) => stmts.findById.get(id),
  create: ({ username, passwordHash }) =>
    stmts.insert.run({ username, password_hash: passwordHash }),
  updatePassword: ({ id, passwordHash }) =>
    stmts.updatePassword.run({ id, password_hash: passwordHash }),
  count: () => stmts.count.get().n,
};
