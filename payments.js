const axios = require("axios");
const crypto = require("crypto");

const {
  ANYPAY_API_ID,
  ANYPAY_API_KEY,
  ANYPAY_SECRET,
  REFERRAL_BONUS_DAYS,
} = require("./config");

const { getUser, updateUser } = require("./users");
const { createPaidKey } = require("./keys");

const payments = new Map();

function generateOrderId(userId, tariffId) {
  return `ORD-${userId}-${tariffId}-${Date.now()}`;
}

async function createPayment(ctx, tariff, referrerId, amount, promoOrRef) {
  const orderId = generateOrderId(ctx.from.id, tariff.id);

  payments.set(orderId, {
    userId: ctx.from.id,
    tariffId: tariff.id,
    referrerId,
    status: "pending",
    promoOrRef: promoOrRef || null,
  });

  const res = await axios.post("https://anypay.io/api/v3/invoice/create", {
    api_id: ANYPAY_API_ID,
    api_key: ANYPAY_API_KEY,
    amount,
    order_id: orderId,
    description: `Подписка ${tariff.title}`,
    callback_url: "https://astraguardvpn-production.up.railway.app/anypay/webhook",
    success_url: "https://t.me/AstraGuardVPN_bot",
    fail_url: "https://t.me/AstraGuardVPN_bot",
  });

  await ctx.reply(`Оплати по ссылке:\n${res.data.data.url}`);
}

async function handleWebhook(bot, data) {
  const { order_id, status, sign } = data;

  const check = crypto.createHash("sha256").update(order_id + ANYPAY_SECRET).digest("hex");
  if (check !== sign) return;

  const payment = payments.get(order_id);
  if (!payment) return;

  if (status !== "paid") return;

  const { userId, tariffId, referrerId } = payment;

  const user = await getUser(userId);
  const now = Date.now();
  const current = user.subscriptionUntil > now ? user.subscriptionUntil : now;

  const tariffDays = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "180d": 180,
    "365d": 365,
  }[tariffId];

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

    bot.telegram.sendMessage(referrerId, `🎉 Твой код использовали! +${REFERRAL_BONUS_DAYS} дней.`);
  }

  bot.telegram.sendMessage(
    userId,
    `Оплата получена!\nПодписка до: ${new Date(newUntil).toLocaleString()}\nКлюч: ${key}`
  );
}

module.exports = { createPayment, handleWebhook };
