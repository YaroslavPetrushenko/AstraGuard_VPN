const { Pool } = require("pg");
const { DATABASE_URL } = require("./config");

/**
 * Подключение к PostgreSQL
 * Работает на Railway, Render, Neon, Supabase, VPS.
 */
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // для Railway/Render/Neon
  },
});

// Проверка подключения (необязательно, но полезно)
pool
  .connect()
  .then((client) => {
    client.release();
    console.log("[DB] Подключение к PostgreSQL успешно");
  })
  .catch((err) => {
    console.error("[DB] Ошибка подключения:", err.message);
  });

module.exports = { pool };
