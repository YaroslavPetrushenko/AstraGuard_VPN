const db = require("../db");

function saveUserMessage(userId, text) {
  db.prepare(`
    INSERT INTO tickets (user_id, message, from_admin, created_at)
    VALUES (?, ?, 0, datetime('now'))
  `).run(userId, text);
}

function saveAdminReply(userId, text) {
  db.prepare(`
    INSERT INTO tickets (user_id, message, from_admin, created_at)
    VALUES (?, ?, 1, datetime('now'))
  `).run(userId, text);
}

module.exports = {
  saveUserMessage,
  saveAdminReply
};
