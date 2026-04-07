const { pool } = require("./db");

/**
 * Создать новый тикет
 * @param {string} ticketId — ID тикета (например T-AB12CD34)
 * @param {number} userId — Telegram ID пользователя
 */
async function createTicket(ticketId, userId) {
  await pool.query(
    `
    INSERT INTO tickets (ticket_id, user_id, status, created_at, updated_at, notified)
    VALUES ($1, $2, 'open', NOW(), NOW(), FALSE)
    `,
    [ticketId, userId]
  );
}

/**
 * Получить открытый тикет пользователя
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
async function getUserOpenTicket(userId) {
  const res = await pool.query(
    `
    SELECT ticket_id, user_id, status, assigned_admin, created_at, updated_at
    FROM tickets
    WHERE user_id = $1 AND status = 'open'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId]
  );

  return res.rows[0] || null;
}

/**
 * Добавить сообщение пользователя в тикет
 * @param {string} ticketId
 * @param {string} text
 */
async function addUserMessage(ticketId, text) {
  await pool.query(
    `
    INSERT INTO messages (ticket_id, sender, text, created_at, delivered)
    VALUES ($1, 'user', $2, NOW(), FALSE)
    `,
    [ticketId, text]
  );

  await pool.query(
    `
    UPDATE tickets
    SET updated_at = NOW()
    WHERE ticket_id = $1
    `,
    [ticketId]
  );
}

/**
 * Получить все сообщения тикета (для клиента не используется, но оставляем)
 */
async function getTicketMessages(ticketId) {
  const res = await pool.query(
    `
    SELECT id, sender, admin_id, text, created_at, delivered
    FROM messages
    WHERE ticket_id = $1
    ORDER BY created_at ASC
    `,
    [ticketId]
  );

  return res.rows;
}

module.exports = {
  createTicket,
  getUserOpenTicket,
  addUserMessage,
  getTicketMessages,
};
