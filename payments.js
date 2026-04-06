const axios = require("axios");
const crypto = require("crypto");
const db = require("./db");

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
  const orderId = generateOrderId(ctx.from.id, tariff.id);

  // запись в SQLite
  db.prepare(`
    INSERT INTO payments (orderId, userId, tariffId, referrerId, amount, promoOrRef, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    orderId,
    ctx.from.id,
    tariff.id,
    referrerId || null,
    amount,
    promoOrRef || null,
    Date.now()
  );

  // создаём счёт в AnyPay
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

  // проверка подписи
  const check = crypto
    .createHash("sha256")
    .update(order_id + ANYPAY_SECRET)
    .digest("hex");

  if (check !== sign) return;

  // ищем платёж
  const payment = db
    .prepare("SELECT * FROM payments WHERE orderId = ?")
    .get(order_id);

  if (!payment) return;

  // если не оплачен
  if (status !== "paid") {
    db.prepare("UPDATE payments SET status = 'failed' WHERE orderId = ?")
      .run(order_id);
    return;
  }

  // помечаем как успешный
  db.prepare("UPDATE payments SET status = 'success' WHERE orderId = ?")
    .run(order_id);

  const { userId, tariffId, referrerId } = payment;

  // дни тарифа
  const tariffDays = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "180d": 180,
    "365d": 365,
  }[tariffId];

  // обновляем подписку пользователя
  const user = await getUser(userId);
  const now = Date.now();
  const current = user.subscriptionUntil > now ? user.subscriptionUntil : now;
  const newUntil = current + tariffDays * 86400000;

  // создаём ключ
  const { key } = await createPaidKey(userId, tariffDays);

  await updateUser(userId, {
    subscriptionUntil: newUntil,
    lastKey: key,
  });

  // рефералка
  // рефереру — бонусные дни + paidCount++
  // рефереру — бонусные дни + paidCount++
  if (referrerId) {
    const refUser = getUser(referrerId);
    const refNow = Date.now();
    const refCurrent =
      refUser.subscriptionUntil > refNow ? refUser.subscriptionUntil : refNow;

    const refNew = refCurrent + REFERRAL_BONUS_DAYS * 86400000;

    updateUser(referrerId, {
      subscriptionUntil: refNew,
      paidCount: (refUser.paidCount || 0) + 1,
    });

    bot.telegram.sendMessage(
      referrerId,
      `🎉 Твой промокод использовали! Тебе начислено +${REFERRAL_BONUS_DAYS} дней.`
    );
  }



  // уведомление пользователя
  bot.telegram.sendMessage(
    userId,
    `Оплата получена!\nПодписка до: ${new Date(newUntil).toLocaleString("ru-RU")}\nКлюч: ${key}`
  );
}

module.exports = { createPayment, handleWebhook };
