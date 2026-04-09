const db = require("../db");

db.prepare(`
  CREATE TABLE IF NOT EXISTS promos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    discount INTEGER,
    max_uses INTEGER,
    used INTEGER DEFAULT 0
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS promo_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    promo_id INTEGER,
    created_at TEXT
  )
`).run();

function getPromoByName(name) {
  return db.prepare(`
    SELECT * FROM promos WHERE name = ?
  `).get(name);
}

function canUsePromo(promo) {
  if (promo.max_uses === null || promo.max_uses === undefined) return true;
  return promo.used < promo.max_uses;
}

function hasUserUsedPromo(userId, promoId) {
  const row = db.prepare(`
    SELECT * FROM promo_usage WHERE user_id = ? AND promo_id = ?
  `).get(userId, promoId);
  return !!row;
}

function markPromoUsed(userId, promoId) {
  db.prepare(`
    INSERT INTO promo_usage (user_id, promo_id, created_at)
    VALUES (?, ?, datetime('now'))
  `).run(userId, promoId);

  db.prepare(`
    UPDATE promos SET used = used + 1 WHERE id = ?
  `).run(promoId);
}

module.exports = {
  getPromoByName,
  canUsePromo,
  hasUserUsedPromo,
  markPromoUsed
};
