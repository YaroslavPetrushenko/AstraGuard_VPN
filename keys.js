const connectDB = require("./db");
const crypto = require("crypto");

function gen(prefix) {
  return `${prefix}-` + crypto.randomBytes(4).toString("hex").toUpperCase();
}

async function createTrialKey(userId, days) {
  const db = await connectDB();
  const keys = db.collection("keys");

  const key = gen("TRIAL");
  const now = Date.now();
  const expiresAt = now + days * 86400000;

  await keys.insertOne({
    key,
    userId,
    type: "trial",
    createdAt: now,
    expiresAt,
    status: "active",
  });

  return { key, expiresAt };
}

async function createPaidKey(userId, days) {
  const db = await connectDB();
  const keys = db.collection("keys");

  const key = gen("PAID");
  const now = Date.now();
  const expiresAt = now + days * 86400000;

  await keys.insertOne({
    key,
    userId,
    type: "paid",
    createdAt: now,
    expiresAt,
    status: "active",
  });

  return { key, expiresAt };
}

module.exports = { createTrialKey, createPaidKey };
