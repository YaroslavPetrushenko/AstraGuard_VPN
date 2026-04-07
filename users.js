const { pool } = require("./db");

async function createUserIfNotExists(user) {
  const userId = user.id;

  const username = user.username || null;
  const firstName = user.first_name || null;
  const lastName = user.last_name || null;

  await pool.query(
    `
    INSERT INTO users (user_id, username, first_name, last_name)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id) DO UPDATE
      SET username = EXCLUDED.username,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name;
    `,
    [userId, username, firstName, lastName]
  );
}

async function getUser(userId) {
  const res = await pool.query(
    `SELECT * FROM users WHERE user_id = $1`,
    [userId]
  );
  return res.rows[0] || null;
}

module.exports = {
  createUserIfNotExists,
  getUser,
};
