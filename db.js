const Database = require("better-sqlite3");

const db = new Database("data.db");

// USERS
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  userId TEXT PRIMARY KEY,
  referralCode TEXT,
  referredBy TEXT,
  invitedCount INTEGER,
  paidCount INTEGER,
  trialUsed INTEGER,
  subscriptionUntil INTEGER,
  lastKey TEXT
);
`);

// KEYS
db.exec(`
CREATE TABLE IF NOT EXISTS keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE,
  userId TEXT,
  type TEXT,
  createdAt INTEGER,
  expiresAt INTEGER,
  status TEXT
);
`);

// PAYMENTS
db.exec(`
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId TEXT UNIQUE,
  userId TEXT,
  tariffId TEXT,
  referrerId TEXT,
  amount REAL,
  promoOrRef TEXT,
  status TEXT,
  createdAt INTEGER
);
`);

module.exports = db;
