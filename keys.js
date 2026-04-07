const { pool } = require("./db");
const crypto = require("crypto");

// Создание VPN-ключа
async function createVpnKey(userId, days, devices = 1, traffic = "unlimited") {
  const key = "AG-" + crypto.randomBytes(16).toString("hex").toUpperCase();
  const expiresAt = new Date(Date.now() + days * 86400000);

  const res = await pool.query(
    `
    INSERT INTO vpn_keys (user_id, key, days, devices, traffic, expires_at, active)
    VALUES ($1, $2, $3, $4, $5, $6, TRUE)
    RETURNING *;
    `,
    [userId, key, days, devices, traffic, expiresAt]
  );

  return res.rows[0];
}

// Активные ключи пользователя
async function getUserActiveKeys(userId) {
  const res = await pool.query(
    `
    SELECT *
    FROM vpn_keys
    WHERE user_id = $1
      AND active = TRUE
      AND expires_at > NOW()
    ORDER BY expires_at ASC;
    `,
    [userId]
  );
  return res.rows;
}

// Деактивация просроченных ключей
async function deactivateExpiredKeys() {
  await pool.query(
    `
    UPDATE vpn_keys
    SET active = FALSE
    WHERE active = TRUE
      AND expires_at <= NOW();
    `
  );
}

module.exports = {
  createVpnKey,
  getUserActiveKeys,
  deactivateExpiredKeys,
};
