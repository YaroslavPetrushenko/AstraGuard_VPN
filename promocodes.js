const { pool } = require("./db");

/**
 * Получить промокод по коду
 * @param {string} code
 * @returns {Promise<object|null>}
 */
async function getPromocode(code) {
  const res = await pool.query(
    `
    SELECT code, discount, uses_left
    FROM promocodes
    WHERE code = $1
    LIMIT 1
    `,
    [code]
  );

  return res.rows[0] || null;
}

/**
 * Проверить, использовал ли пользователь промокод
 * @param {number} userId
 * @param {string} code
 * @returns {Promise<boolean>}
 */
async function hasUserUsedPromo(userId, code) {
  const res = await pool.query(
    `
    SELECT 1
    FROM promo_usage
    WHERE user_id = $1 AND code = $2
    LIMIT 1
    `,
    [userId, code]
  );

  return res.rowCount > 0;
}

/**
 * Отметить использование промокода
 * @param {number} userId
 * @param {string} code
 */
async function markPromoUsed(userId, code) {
  // записываем факт использования
  await pool.query(
    `
    INSERT INTO promo_usage (user_id, code, used_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT DO NOTHING
    `,
    [userId, code]
  );

  // уменьшаем количество оставшихся использований
  await pool.query(
    `
    UPDATE promocodes
    SET uses_left = uses_left - 1
    WHERE code = $1 AND uses_left > 0
    `,
    [code]
  );
}

/**
 * Получить все промокоды (если понадобится в клиенте)
 */
async function getAllPromocodes() {
  const res = await pool.query(
    `
    SELECT code, discount, uses_left
    FROM promocodes
    ORDER BY code ASC
    `
  );

  return res.rows;
}

module.exports = {
  getPromocode,
  hasUserUsedPromo,
  markPromoUsed,
  getAllPromocodes,
};
