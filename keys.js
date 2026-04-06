const db = require("./db");
const crypto = require("crypto");

function gen(prefix) {
  return `${prefix}-` + crypto.randomBytes(4).toString("hex").toUpperCase();
}

function createTrialKey(userId, days) {
  const key = gen("TRIAL");
  const now = Date.now();
  const expiresAt = now + days * 86400000;

  db.prepare(`
    INSERT INTO keys (key, userId, type, createdAt, expiresAt, status)
    VALUES (?, ?, 'trial', ?, ?, 'active')
  `).run(key, userId, now, expiresAt);

  return { key, expiresAt };
}

function createPaidKey(userId, days) {
  const key = gen("PAID");
  const now = Date.now();
  const expiresAt = now + days * 86400000;

  db.prepare(`
    INSERT INTO keys (key, userId, type, createdAt, expiresAt, status)
    VALUES (?, ?, 'paid', ?, ?, 'active')
  `).run(key, userId, now, expiresAt);

  return { key, expiresAt };
}

module.exports = { createTrialKey, createPaidKey };
