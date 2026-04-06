const axios = require("axios");
const crypto = require("crypto");
const connectDB = require("./db");

const {
  ANYPAY_API_ID,
  ANYPAY_API_KEY,
  ANYPAY_SECRET,
  ANYPAY_WEBHOOK_URL,
  REFERRAL_BONUS_DAYS,
} = require("./config");

const { getUser, updateUser } = require("./users");
const { createPaidKey } = require("./keys");

function generateOrderId(userId, tariffId) {
  return `ORD-${userId}-${tariffId}-${Date.now()}`;
}

async function createPayment(ctx, tariff, referrerId, amount, promoOrRef) {
  const db = await connectDB();
  const payments = db.collection("payments");

  const orderId = generateOrderId(ctx.from.id, tariff.id);

  await payments.insertOne({
    orderId,
    userId: ctx.from.id,
    tariffId: tariff.id,
    referrerId: referrerId || null,
    amount,
    promoOrRef: promoOrRef || null,
    status: "pending",
    createdAt: Date.now(),
  });

  const res = await axios.post("https://anypay.io/api/v3/invoice/create", {
    api_id: ANYPAY_API_ID,
    api_key: ANYPAY_API_KEY,
    amount,
    order_id: orderId,
    description: `Подписка ${tariff.title}`,
    callback_url: ANYPAY_WEBHOOK_URL,
    success_url: "https://t.me/AstraGuardVPN_bot",
    fail_url: "https://t.me/AstraGuardVPN_bot",
  });

  await ctx.reply(`Оплати по ссылке:\n${res.data.data.url}`);
}

async function handleWebhook(bot, data) {
  const { order_id, status, sign } = data;

  const check = crypto
    .createHash("sha256")
    .update(order_id + ANYPAY_SECRET)
    .digest("hex");

  if (check !== sign) return;

  const db = await connectDB();
  const payments = db.collection("payments");

  const payment = await payments.findOne({ orderId: order_id });
  if (!payment) return;

  if (status !== "paid") {
    await payments.updateOne({ orderId: order_id }, { $set: { status: "failed" } });
    return;
  }

  await payments.updateOne({ orderId: order_id }, { $set: { status: "success" } });

  const { userId, tariffId, referrerId } = payment;

  const tariffDays = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "180d": 180,
    "365d": 365,
  }[tariffId];

  const user = await getUser(userId);
  const now = Date.now();
  const current = user.subscriptionUntil > now ? user.subscriptionUntil : now;
  const newUntil = current + tariffDays * 86400000;

  const { key } = await createPaidKey(userId, tariffDays);

  await updateUser(userId, {
    subscriptionUntil: newUntil,
    lastKey: key,
  });

  if (referrerId) {
    const refUser = await getUser(referrerId);
    const refNow = Date.now();
    const refCurrent = refUser.subscriptionUntil > refNow ? refUser.subscriptionUntil : refNow;
    const refNew = refCurrent + REFERRAL_BONUS_DAYS * 86400000;

    await updateUser(referrerId, {
      subscriptionUntil: refNew,
      paidCount: (refUser.paidCount || 0) + 1,
    });

    bot.telegram.sendMessage(
      referrerId,
      `🎉 Твой код использовали! +${REFERRAL_BONUS_DAYS} дней.`
    );
  }

  bot.telegram.sendMessage(
    userId,
    `Оплата получена!\nПодписка до: ${new Date(newUntil).toLocaleString("ru-RU")}\nКлюч: ${key}`
  );
}

module.exports = { createPayment, handleWebhook };
