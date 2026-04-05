// ===============================
// IMPORTS
// ===============================
const express = require("express");
const bodyParser = require("body-parser");
const { Telegraf, Markup } = require("telegraf");

const {
  TELEGRAM_BOT_TOKEN,
  TARIFFS,
  TRIAL_DAYS,
  PROMOCODES,
  REFERRAL_BONUS_DAYS,
} = require("./config");

const { getUser, updateUser, findUserByReferralCode } = require("./users");
const { createTrialKey, createPaidKey } = require("./keys");
const payments = require("./payments");
const registerAdminCommands = require("./admin");
const registerBroadcast = require("./broadcast");
const registerSupport = require("./support");

// ===============================
// INIT BOT
// ===============================
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ===============================
// HELPERS
// ===============================
function mainMenu() {
  return Markup.keyboard([
    ["🚀 Мой VPN", "💳 Купить подписку"],
    ["🆓 Пробный доступ", "👥 Реферальная программа"],
    ["📱 Как подключиться?", "ℹ️ О сервисе"],
    ["💬 Поддержка"],
  ]).resize();
}

function formatDate(ts) {
  if (!ts) return "нет";
  return new Date(ts).toLocaleString("ru-RU");
}

// ===============================
// AUTO‑CREATE USER
// ===============================
bot.on("message", async (ctx, next) => {
  await getUser(ctx.from.id);
  next();
});

// ===============================
// START
// ===============================
bot.start(async (ctx) => {
  const user = await getUser(ctx.from.id);
  ctx.reply(
    `Привет, ${ctx.from.first_name}!\n\n` +
      `Твой реферальный код: ${user.referralCode}\n\n` +
      `Выбери действие в меню ниже.`,
    mainMenu()
  );
});

// ===============================
// МОЙ VPN
// ===============================
bot.hears("🚀 Мой VPN", async (ctx) => {
  const user = await getUser(ctx.from.id);

  const until = user.subscriptionUntil
    ? formatDate(user.subscriptionUntil)
    : "подписка не активна";

  const keyText = user.lastKey
    ? `Твой последний ключ:\n\`${user.lastKey}\``
    : "Ключ ещё не выдавался.";

  ctx.reply(
    `📦 *Мой VPN*\n\nСтатус подписки: ${until}\n\n${keyText}`,
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// ===============================
// ПРОБНЫЙ ДОСТУП
// ===============================
bot.hears("🆓 Пробный доступ", async (ctx) => {
  const user = await getUser(ctx.from.id);

  if (user.trialUsed)
    return ctx.reply("Пробный доступ уже был активирован ранее.", mainMenu());

  const { key, expiresAt } = await createTrialKey(ctx.from.id, TRIAL_DAYS);

  await updateUser(ctx.from.id, {
    trialUsed: true,
    subscriptionUntil: expiresAt,
    lastKey: key,
  });

  ctx.reply(
    `🆓 Пробный доступ активирован!\n\n` +
      `Подписка активна до: ${formatDate(expiresAt)}\n` +
      `Твой ключ:\n\`${key}\``,
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// ===============================
// РЕФЕРАЛЬНАЯ ПРОГРАММА
// ===============================
bot.hears("👥 Реферальная программа", async (ctx) => {
  const user = await getUser(ctx.from.id);

  ctx.reply(
    `👥 *Реферальная программа*\n\n` +
      `Твой реферальный код:\n\`${user.referralCode}\`\n\n` +
      `Приглашено: ${user.invitedCount}\n` +
      `Оплатили: ${user.paidCount}\n\n` +
      `За каждую оплату по твоему коду — +${REFERRAL_BONUS_DAYS} дней.`,
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// ===============================
// КАК ПОДКЛЮЧИТЬСЯ
// ===============================
bot.hears("📱 Как подключиться?", (ctx) => {
  ctx.reply(
    "📱 *Как подключиться к VPN*\n\n" +
      "1. Установи приложение VPN.\n" +
      "2. Вставь выданный ключ.\n" +
      "3. Нажми «Подключиться».",
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// ===============================
// О СЕРВИСЕ
// ===============================
bot.hears("ℹ️ О сервисе", (ctx) => {
  ctx.reply(
    "ℹ️ *AstraGuardVPN*\n\n" +
      "• Быстрые сервера\n" +
      "• Защита трафика\n" +
      "• Автоматическая выдача ключей\n" +
      "• Реферальная программа",
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// ===============================
// КУПИТЬ ПОДПИСКУ
// ===============================
bot.hears("💳 Купить подписку", (ctx) => {
  const buttons = TARIFFS.map((t) => [
    Markup.button.callback(`${t.title} — ${t.price}₽`, `tariff_${t.id}`),
  ]);
  ctx.reply("Выбери тариф:", Markup.inlineKeyboard(buttons));
});

// ===============================
// ВЫБОР ТАРИФА
// ===============================
const promoState = new Map();

bot.action(/tariff_(.+)/, async (ctx) => {
  const tariffId = ctx.match[1];
  promoState.set(ctx.from.id, tariffId);

  await ctx.answerCbQuery();
  ctx.reply("Введите промокод или реферальный код:");
});

// ===============================
// ПРОМОКОД / РЕФЕРАЛКА
// ===============================
bot.on("text", async (ctx, next) => {
  const tariffId = promoState.get(ctx.from.id);
  if (!tariffId) return next();

  const tariff = TARIFFS.find((t) => t.id === tariffId);
  const code = ctx.message.text.trim().toUpperCase();

  let referrerId = null;

  const refUser = await findUserByReferralCode(code);
  if (refUser && refUser.userId !== ctx.from.id) {
    referrerId = refUser.userId;
  }

  promoState.delete(ctx.from.id);

  await payments.createPayment(ctx, tariff, referrerId, tariff.price, code);
});

// ===============================
// ПОДДЕРЖКА
// ===============================
registerSupport(bot);

// ===============================
// АДМИН‑КОМАНДЫ
// ===============================
registerAdminCommands(bot);

// ===============================
// РАССЫЛКИ
// ===============================
registerBroadcast(bot);

// ===============================
// ФОТО‑РАССЫЛКА
// ===============================

// ===============================
// EXPRESS + WEBHOOK
// ===============================
const app = express();
app.use(bodyParser.json());

app.post("/anypay/webhook", async (req, res) => {
  await payments.handleWebhook(bot, req.body);
  res.send("OK");
});

// ===============================
// START
// ===============================
bot.launch();
app.listen(3000, () => console.log("Server running on 3000"));
console.log("AstraGuardVPN bot started");
