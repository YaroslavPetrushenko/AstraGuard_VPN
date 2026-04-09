const db = require("../db");

// тут ты подставишь свою реальную логику генерации
async function giveTrial(userId) {
  const row = db.prepare(`
    SELECT * FROM vpn_trials WHERE user_id = ?
  `).get(userId);

  if (!row) {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS vpn_trials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        created_at TEXT
      )
    `).run();

    db.prepare(`
      INSERT INTO vpn_trials (user_id, created_at)
      VALUES (?, datetime('now'))
    `).run(userId);

    const url = `https://example.com/trial/${userId}`;
    return url;
  }

  return null;
}

async function givePaid(userId, days) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS vpn_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      url TEXT,
      days INTEGER,
      created_at TEXT
    )
  `).run();

  const url = `https://example.com/vpn/${userId}/${Date.now()}`;

  db.prepare(`
    INSERT INTO vpn_keys (user_id, url, days, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(userId, url, days);

  return url;
}

async function getUserKeys(userId) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS vpn_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      url TEXT,
      days INTEGER,
      created_at TEXT
    )
  `).run();

  return db.prepare(`
    SELECT * FROM vpn_keys WHERE user_id = ?
  `).all(userId);
}

module.exports = {
  giveTrial,
  givePaid,
  getUserKeys
};
