const Database = require("better-sqlite3");
const db = new Database("./database.db");

// Создание таблиц
db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    referrer INTEGER,
    created_at TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    key TEXT,
    expires_at TEXT,
    is_trial INTEGER
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    invited_id INTEGER
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message TEXT,
    from_admin INTEGER,
    created_at TEXT
)`).run();

module.exports = db;
