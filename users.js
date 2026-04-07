const { pool } = require("./db");

/**
 * Создать пользователя, если его нет.
 * Если он уже есть — обновить username / имя / фамилию.
 *
 * @param {object} user — ctx.from
 */
async function createUserIfNotExists(user) {
  const userId = user.id;
  const username = user.username || null;
  const firstName = user.first_name || null;
  const lastName = user.last_name || null;

  // создаём или обновляем
  await pool.query(
    `
    INSERT INTO users (user_id, username, first_name, last_name, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name
    `,
    [userId, username, firstName, lastName]
  );
}

/**
 * Получить пользователя по Telegram ID
 *
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
async function getUser(userId) {
  const res = await pool.query(
    `
    SELECT user_id, username, first_name, last_name, created_at
    FROM users
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId]
  );

  return res.rows[0] || null;
}

/**
 * Проверить, существует ли пользователь
 */
async function userExists(userId) {
  const res = await pool.query(
    `
    SELECT 1 FROM users
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId]
  );

  return res.rowCount > 0;
}

/**
 * Получить всех пользователей (для статистики, если понадобится)
 */
async function getAllUsers(limit = 1000) {
  const res = await pool.query(
    `
    SELECT user_id, username, first_name, last_name, created_at
    FROM users
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [limit]
  );

  return res.rows;
}

module.exports = {
  createUserIfNotExists,
  getUser,
  userExists,
  getAllUsers,
};
