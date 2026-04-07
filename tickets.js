const { pool } = require("./db");

// Клиентский бот
async function createTicket(ticketId, userId) {
  await pool.query(
    `
    INSERT INTO tickets (ticket_id, user_id, status, notified)
    VALUES ($1, $2, 'open', FALSE)
    ON CONFLICT (ticket_id) DO NOTHING;
    `,
    [ticketId, userId]
  );
}

async function getUserOpenTicket(userId) {
  const res = await pool.query(
    `
    SELECT *
    FROM tickets
    WHERE user_id = $1
      AND status = 'open'
    ORDER BY created_at DESC
    LIMIT 1;
    `,
    [userId]
  );
  return res.rows[0] || null;
}

async function addUserMessage(ticketId, text) {
  await pool.query(
    `
    INSERT INTO messages (ticket_id, sender, text)
    VALUES ($1, 'user', $2);
    `,
    [ticketId, text]
  );
}

// Админ-бот: список тикетов по статусу
async function getTicketsByStatus(status, limit = 20) {
  const res = await pool.query(
    `
    SELECT
      t.ticket_id,
      t.user_id,
      t.status,
      t.assigned_admin,
      t.notified,
      t.created_at,
      u.username,
      u.first_name,
      u.last_name,
      COUNT(m.id) AS messages_count
    FROM tickets t
    JOIN users u ON u.user_id = t.user_id
    LEFT JOIN messages m ON m.ticket_id = t.ticket_id
    WHERE t.status = $1
    GROUP BY t.ticket_id, u.user_id
    ORDER BY t.created_at DESC
    LIMIT $2;
    `,
    [status, limit]
  );
  return res.rows;
}

async function getTicket(ticketId) {
  const res = await pool.query(
    `
    SELECT
      t.ticket_id,
      t.user_id,
      t.status,
      t.assigned_admin,
      t.notified,
      t.created_at,
      u.username,
      u.first_name,
      u.last_name
    FROM tickets t
    JOIN users u ON u.user_id = t.user_id
    WHERE t.ticket_id = $1;
    `,
    [ticketId]
  );
  return res.rows[0] || null;
}

async function getTicketMessages(ticketId) {
  const res = await pool.query(
    `
    SELECT id, ticket_id, sender, text, admin_id, delivered, created_at
    FROM messages
    WHERE ticket_id = $1
    ORDER BY created_at ASC, id ASC;
    `,
    [ticketId]
  );
  return res.rows;
}

async function assignTicket(ticketId, adminId) {
  const res = await pool.query(
    `
    UPDATE tickets
    SET assigned_admin = $2
    WHERE ticket_id = $1
      AND (assigned_admin IS NULL OR assigned_admin = $2)
      AND status = 'open'
    RETURNING *;
    `,
    [ticketId, adminId]
  );
  return res.rows[0] || null;
}

async function freeTicket(ticketId, adminId) {
  const res = await pool.query(
    `
    UPDATE tickets
    SET assigned_admin = NULL
    WHERE ticket_id = $1
      AND assigned_admin = $2
      AND status = 'open'
    RETURNING *;
    `,
    [ticketId, adminId]
  );
  return res.rows[0] || null;
}

async function closeTicket(ticketId) {
  const res = await pool.query(
    `
    UPDATE tickets
    SET status = 'closed',
        assigned_admin = NULL
    WHERE ticket_id = $1
      AND status = 'open'
    RETURNING *;
    `,
    [ticketId]
  );
  return res.rows[0] || null;
}

async function addAdminMessage(ticketId, adminId, text) {
  await pool.query(
    `
    INSERT INTO messages (ticket_id, sender, text, admin_id, delivered)
    VALUES ($1, 'admin', $2, $3, FALSE);
    `,
    [ticketId, text, adminId]
  );
}

// Новые тикеты для уведомления админов
async function getNewTicketsForNotify() {
  const res = await pool.query(
    `
    SELECT
      t.ticket_id,
      t.user_id,
      t.status,
      t.assigned_admin,
      t.notified,
      t.created_at,
      u.username,
      u.first_name,
      u.last_name
    FROM tickets t
    JOIN users u ON u.user_id = t.user_id
    WHERE t.status = 'open'
      AND (t.notified IS NULL OR t.notified = FALSE)
    ORDER BY t.created_at ASC
    LIMIT 50;
    `
  );
  return res.rows;
}

async function markTicketNotified(ticketId) {
  await pool.query(
    `
    UPDATE tickets
    SET notified = TRUE
    WHERE ticket_id = $1;
    `,
    [ticketId]
  );
}

module.exports = {
  createTicket,
  getUserOpenTicket,
  addUserMessage,

  getTicketsByStatus,
  getTicket,
  getTicketMessages,
  assignTicket,
  freeTicket,
  closeTicket,
  addAdminMessage,
  getNewTicketsForNotify,
  markTicketNotified,
};
