const db = require("./db");

function getUser(userId) {
  const stmt = db.prepare("SELECT * FROM users WHERE userId = ?");
  let user = stmt.get(userId);

  if (!user) {
    user = {
      userId,
      referralCode: `AG-${userId}`,
      referredBy: null,
      invitedCount: 0,
      paidCount: 0,
      trialUsed: 0,
      subscriptionUntil: null,
      lastKey: null,
    };

    db.prepare(`
      INSERT INTO users (userId, referralCode, referredBy, invitedCount, paidCount, trialUsed, subscriptionUntil, lastKey)
      VALUES (@userId, @referralCode, @referredBy, @invitedCount, @paidCount, @trialUsed, @subscriptionUntil, @lastKey)
    `).run(user);
  }

  return user;
}

function updateUser(userId, data) {
  const keys = Object.keys(data);
  const values = Object.values(data);

  const set = keys.map(k => `${k} = ?`).join(", ");

  db.prepare(`UPDATE users SET ${set} WHERE userId = ?`)
    .run(...values, userId);
}

function findUserByReferralCode(code) {
  return db.prepare("SELECT * FROM users WHERE referralCode = ?").get(code);
}

function getAllUsers() {
  return db.prepare("SELECT * FROM users").all();
}

module.exports = { getUser, updateUser, findUserByReferralCode, getAllUsers };
