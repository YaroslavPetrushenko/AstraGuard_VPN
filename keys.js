const { pool } = require("./db");
const crypto = require("crypto");

/**
 * Создать VPN‑ключ и сохранить в БД
 * @param {number} userId — Telegram ID пользователя
 * @param {number} days — срок действия
 * @param {number} devices — количество устройств
 * @param {string} traffic — трафик (например "unlimited" или "50GB")
 */
async function createVpnKey(userId, days, devices = 1, traffic = "unlimited") {
  const key = "AG-" + crypto.randomBytes(16).toString("hex").toUpperCase();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 86400000);

  const res = await pool.query(
    `
    INSERT INTO vpn_keys (user_id, key, days, devices, traffic, created_at, expires_at, active)
    VALUES ($1, $2, $3, $4, $5, NOW(), $6, TRUE)
    RETURNING *
    `,
    [userId, key, days, devices, traffic, expiresAt]
  );

  return res.rows[0];
}

/**
 * Получить все активные ключи пользователя
 */
async function getUserActiveKeys(userId) {
  const res = await pool.query(
    `
    SELECT id, key, days, devices, traffic, created_at, expires_at, active
    FROM vpn_keys
    WHERE user_id = $1 AND active = TRUE
    ORDER BY created_at DESC
    `,
    [userId]
  );
  return res.rows;
}

/**
 * Деактивировать ключ вручную
 */
async function deactivateKey(key) {
  const res = await pool.query(
    `
    UPDATE vpn_keys
    SET active = FALSE
    WHERE key = $1
    RETURNING *
    `,
    [key]
  );
  return res.rows[0] || null;
}

/**
 * Деактивировать все просроченные ключи
 */
async function deactivateExpiredKeys() {
  await pool.query(
    `
    UPDATE vpn_keys
    SET active = FALSE
    WHERE active = TRUE AND expires_at < NOW()
    `
  );
}

/**
 * Получить ключ по значению
 */
async function getKey(key) {
  const res = await pool.query(
    `
    SELECT *
    FROM vpn_keys
    WHERE key = $1
    LIMIT 1
    `,
    [key]
  );
  return res.rows[0] || null;
}

module.exports = {
  createVpnKey,
  getUserActiveKeys,
  deactivateKey,
  deactivateExpiredKeys,
  getKey,
};
