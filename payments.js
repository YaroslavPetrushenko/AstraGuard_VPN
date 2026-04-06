const axios = require("axios");
const crypto = require("crypto");
const { getUser, updateUser } = require("./users");
const { generateKey } = require("./keys");
const { REFERRAL_BONUS_DAYS } = require("./config");

// ===============================
// СОЗДАНИЕ ПЛАТЕЖА (AnyPay)
// ===============================
async function createPayment(ctx, tariff, referrerId, finalPrice, sourceText) {
  try {
    const orderId = `ORD-${ctx.from.id}-${tariff.id}-${Date.now()}`;

    const res = await axios.post(
      "https://anypay.io/api/v3/invoice/create",
      {
        api_id: "6UQFFQBVEOTVG5ZO8U",
        api_key: "NhpyWSDreOHxQVy4CZU4yu1VkPkcEBesBmf0mNc",
        amount: finalPrice,
        order_id: orderId,
        description: `Подписка ${tariff.title}`,
        callback_url: "https://astraguardvpn-production.up.railway.app/anypay/webhook",
        success_url: "https://t.me/AstraGuardVPN_bot",
        fail_url: "https://t.me/AstraGuardVPN_bot",
      }
    );

    const payUrl = res.data.data.url;

    // сохраняем данные платежа
    global.payments = global.payments || new Map();
    global.payments.set(orderId, {
      userId: ctx.from.id,
      tariffId: tariff.id,
      referrerId,
      status: "pending",
    });

    ctx.reply(
      `Отлично!\nОплати по ссылке:\n${payUrl}\n\n` +
      `После оплаты подписка активируется автоматически.`
    );
  } catch (err) {
    console.log("AnyPay error:", err.response?.data || err);
    ctx.reply("Ошибка при создании платежа.");
  }
}

// ===============================
// ОБРАБОТКА WEBHOOK ANYPAY
// ===============================
async function handleWebhook(bot, body) {
  const { order_id, status, sign } = body;

  // проверка подписи
  const check = crypto
    .createHash("sha256")
    .update(order_id + "JPqLuGMxDCtdIa8gqGGMVbtUOo28Rgf08Vrhk5B")
    .digest("hex");

  if (check !== sign) {
    console.log("❌ Неверная подпись");
    return;
  }

  if (!global.payments) return;
  const payment = global.payments.get(order_id);
  if (!payment) return;

  if (status !== "paid") {
    payment.status = "failed";
    return;
  }

  payment.status = "success";

  const { userId, tariffId, referrerId } = payment;

  // тарифы должны быть в config.js
  const { TARIFFS } = require("./config");
  const tariff = TARIFFS.find((t) => t.id === tariffId);

  const user = getUser(userId);
  const now = Date.now();
  const current = user.subscriptionUntil > now ? user.subscriptionUntil : now;

  // продление подписки
  let newUntil = current + tariff.days * 86400000;

  // бонус рефереру
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
      `🎉 Твой код использовали! Тебе начислено +${REFERRAL_BONUS_DAYS} дней.`
    );
  }

  // выдача ключа
  const key = generateKey();

  updateUser(userId, {
    subscriptionUntil: newUntil,
    lastKey: key,
  });

  bot.telegram.sendMessage(
    userId,
    `🎉 *Оплата получена!*\n\n` +
    `Подписка активна до: ${new Date(newUntil).toLocaleString("ru-RU")}\n` +
    `Твой ключ:\n\`${key}\``,
    { parse_mode: "Markdown" }
  );
}

module.exports = {
  createPayment,
  handleWebhook,
};
