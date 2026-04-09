const Database = require("better-sqlite3");
const db = new Database("bot.db");

db.pragma("journal_mode = WAL");

// users
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    created_at TEXT
  )
`).run();

// referrals
db.prepare(`
  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    invited_id INTEGER,
    created_at TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS ref_bonus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    days INTEGER,
    created_at TEXT
  )
`).run();

// tickets
db.prepare(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message TEXT,
    from_admin INTEGER,
    created_at TEXT
  )
`).run();

// purchases (черновики)
db.prepare(`
  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    days INTEGER,
    base_price INTEGER,
    promo_id INTEGER
  )
`).run();

// ym_payments
db.prepare(`
  CREATE TABLE IF NOT EXISTS ym_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    amount INTEGER,
    days INTEGER,
    code TEXT,
    status TEXT,
    created_at TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS reply_wait (
    user_id INTEGER PRIMARY KEY,
    admin_id INTEGER
  )
`).run();

module.exports = db;
