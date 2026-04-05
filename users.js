const connectDB = require("./db");

async function getUser(userId) {
  const db = await connectDB();
  const users = db.collection("users");

  let user = await users.findOne({ userId });

  if (!user) {
    user = {
      userId,
      referralCode: `AG-${userId}`,
      referredBy: null,
      invitedCount: 0,
      paidCount: 0,
      trialUsed: false,
      subscriptionUntil: null,
      lastKey: null,
    };
    await users.insertOne(user);
  }

  return user;
}

async function updateUser(userId, data) {
  const db = await connectDB();
  await db.collection("users").updateOne({ userId }, { $set: data });
}

async function findUserByReferralCode(code) {
  const db = await connectDB();
  return await db.collection("users").findOne({ referralCode: code });
}

async function getAllUsers() {
  const db = await connectDB();
  return await db.collection("users").find({}).toArray();
}

module.exports = { getUser, updateUser, findUserByReferralCode, getAllUsers };
