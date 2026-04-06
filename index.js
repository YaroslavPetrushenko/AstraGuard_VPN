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
const { createTrialKey } = require("./keys");
const { createPayment, handleWebhook } = require("./payments");
const registerSupport = require("./support");
const registerAdminCommands = require("./admin");
const registerBroadcast = require("./broadcast");

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const promoState = new Map();

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

// авто-создание пользователя
bot.use((ctx, next) => {
  if (ctx.from) getUser(ctx.from.id); // SQLite синхронный — await не нужен
  return next();
});

// старт
bot.start((ctx) => {
  const user = getUser(ctx.from.id);
  ctx.reply(
    `Привет, ${ctx.from.first_name}!\n\nТвой реферальный код: ${user.referralCode}`,
    mainMenu()
  );
});

// мой vpn
bot.hears("🚀 Мой VPN", (ctx) => {
  const user = getUser(ctx.from.id);

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

// пробный
bot.hears("🆓 Пробный доступ", (ctx) => {
  const user = getUser(ctx.from.id);

  if (user.trialUsed)
    return ctx.reply("Пробный доступ уже был активирован ранее.", mainMenu());

  const { key, expiresAt } = createTrialKey(ctx.from.id, TRIAL_DAYS);

  updateUser(ctx.from.id, {
    trialUsed: 1,
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

// рефералка
bot.hears("👥 Реферальная программа", (ctx) => {
  const user = getUser(ctx.from.id);

  ctx.reply(
    `👥 *Реферальная программа*\n\n` +
    `Твой реферальный код:\n\`${user.referralCode}\`\n\n` +
    `Приглашено: ${user.invitedCount}\n` +
    `Оплатили: ${user.paidCount}\n\n` +
    `За каждую оплату — +${REFERRAL_BONУС_DAYS} дней.`,
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// как подключиться
bot.hears("📱 Как подключиться?", (ctx) => {
  ctx.reply(
    "📱 *Как подключиться к VPN*\n\n" +
    "1. Установи приложение VPN.\n" +
    "2. Вставь ключ.\n" +
    "3. Подключись.",
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// о сервисе
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

// купить подписку
bot.hears("💳 Купить подписку", (ctx) => {
  const buttons = TARIFFS.map((t) => [
    Markup.button.callback(`${t.title} — ${t.price}₽`, `tariff_${t.id}`),
  ]);
  ctx.reply("Выбери тариф:", Markup.inlineKeyboard(buttons));
});

// выбор тарифа
bot.action(/tariff_(.+)/, (ctx) => {
  const tariffId = ctx.match[1];
  const tariff = TARIFFS.find((t) => t.id === tariffId);
  if (!tariff) return ctx.answerCbQuery("Ошибка: тариф не найден");

  promoState.set(ctx.from.id, tariffId);

  ctx.answerCbQuery();
  ctx.reply("Введите промокод или реферальный код.\nЕсли нет — напишите: нет");
});

// промокод / рефералка
bot.on("text", (ctx, next) => {
  const tariffId = promoState.get(ctx.from.id);
  if (!tariffId) return next();

  const text = ctx.message.text.trim();

  // если человек передумал и нажал кнопку — не трогаем, пропускаем дальше
  const buttons = [
    "🚀 Мой VPN",
    "💳 Купить подписку",
    "🆓 Пробный доступ",
    "👥 Реферальная программа",
    "📱 Как подключиться?",
    "ℹ️ О сервисе",
    "💬 Поддержка",
  ];
  if (buttons.includes(text)) return next();

  const tariff = TARIFFS.find((t) => t.id === tariffId);
  if (!tariff) {
    promoState.delete(ctx.from.id);
    return ctx.reply("Ошибка: тариф не найден.");
  }

  const upper = text.toUpperCase();

  let referrerId = null;
  let finalPrice = tariff.price;

  const promo = PROMOCODES.find((p) => p.code === upper);

  if (promo) {
    if (promo.usesLeft <= 0) return ctx.reply("Промокод больше не действует.");
    promo.usesLeft--;
    finalPrice = Math.round(finalPrice * (1 - promo.discount / 100));
    ctx.reply(`🎉 Промокод применён! Цена: ${finalPrice}₽`);
  } else if (upper !== "НЕТ") {
    const refUser = findUserByReferralCode(upper);
    if (!refUser) return ctx.reply("Код не найден.");

    // ВАЖНО: тут почти наверняка id, а не userId
    const refId = refUser.userId || refUser.id;
    if (String(refId) === String(ctx.from.id))
      return ctx.reply("Нельзя использовать свой код.");

    referrerId = refId;

    updateUser(referrerId, {
      invitedCount: (refUser.invitedCount || 0) + 1,
    });
  }

  promoState.delete(ctx.from.id);

  createPayment(ctx, tariff, referrerId, finalPrice, upper);
});


// поддержка / админ / рассылки
registerSupport(bot);
registerAdminCommands(bot);
registerBroadcast(bot);

// express + webhook
const app = express();
app.use(bodyParser.json());

// AnyPay webhook
app.post("/anypay/webhook", async (req, res) => {
  await handleWebhook(bot, req.body);
  res.send("OK");
});

// Telegram webhook endpoint
app.post("/webhook", (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

async function start() {
  await bot.telegram.setWebhook(
    "https://astraguardvpn-production.up.railway.app/webhook"
  );

  console.log("Webhook set");

  app.listen(3000, () => console.log("Server running on 3000"));
}

bot.catch((err, ctx) => {
  console.error("Bot error:", err);
});

start();
