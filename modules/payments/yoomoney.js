const db = require("../db");
const crypto = require("crypto");

function generateCode() {
  return "AG-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

function createPayment(userId, amount, days) {
  const code = generateCode();

  db.prepare(`
    INSERT INTO ym_payments (user_id, amount, days, code, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', datetime('now'))
  `).run(userId, amount, days, code);

  return code;
}

function getLastPendingPayment(userId) {
  return db.prepare(`
    SELECT * FROM ym_payments
    WHERE user_id = ? AND status = 'pending'
    ORDER BY id DESC LIMIT 1
  `).get(userId);
}

function getPaymentById(id) {
  return db.prepare(`
    SELECT * FROM ym_payments WHERE id = ?
  `).get(id);
}

function markPaid(id) {
  db.prepare(`
    UPDATE ym_payments SET status = 'paid' WHERE id = ?
  `).run(id);
}

module.exports = {
  createPayment,
  getLastPendingPayment,
  getPaymentById,
  markPaid
};
