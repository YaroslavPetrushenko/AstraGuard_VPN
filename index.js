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
// промокод / рефералка
bot.use(async (ctx, next) => {
  if (ctx.from) await getUser(ctx.from.id);
  return next();
});



// старт
bot.start(async (ctx) => {
  const user = await getUser(ctx.from.id);
  ctx.reply(
    `Привет, ${ctx.from.first_name}!\n\nТвой реферальный код: ${user.referralCode}`,
    mainMenu()
  );
});

// мой vpn
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

// пробный
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

// рефералка
bot.hears("👥 Реферальная программа", async (ctx) => {
  const user = await getUser(ctx.from.id);

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
bot.action(/tariff_(.+)/, async (ctx) => {
  const tariffId = ctx.match[1];
  const tariff = TARIFFS.find((t) => t.id === tariffId);
  if (!tariff) return ctx.answerCbQuery("Ошибка: тариф не найден");

  promoState.set(ctx.from.id, tariffId);

  await ctx.answerCbQuery();
  ctx.reply("Введите промокод или реферальный код.\nЕсли нет — напишите: нет");
});

// промокод / рефералка
bot.on("text", async (ctx, next) => {
  const tariffId = promoState.get(ctx.from.id);
  if (!tariffId) return next();

  const tariff = TARIFFS.find((t) => t.id === tariffId);
  const text = ctx.message.text.trim().toUpperCase();

  let referrerId = null;
  let finalPrice = tariff.price;

  const promo = PROMOCODES.find((p) => p.code === text);

  if (promo) {
    if (promo.usesLeft <= 0) return ctx.reply("Промокод больше не действует.");
    promo.usesLeft--;
    finalPrice = Math.round(finalPrice * (1 - promo.discount / 100));
    ctx.reply(`🎉 Промокод применён! Цена: ${finalPrice}₽`);
  } else if (text !== "НЕТ") {
    const refUser = await findUserByReferralCode(text);
    if (!refUser) return ctx.reply("Код не найден.");
    if (refUser.userId === ctx.from.id) return ctx.reply("Нельзя использовать свой код.");
    referrerId = refUser.userId;

    const u = await getUser(referrerId);
    await updateUser(referrerId, {
      invitedCount: (u.invitedCount || 0) + 1,
    });
  }

  promoState.delete(ctx.from.id);

  await createPayment(ctx, tariff, referrerId, finalPrice, text);
});

// поддержка / админ / рассылки
registerSupport(bot);
registerAdminCommands(bot);
registerBroadcast(bot);

// express + webhook
const app = express();
app.use(bodyParser.json());

app.post("/anypay/webhook", async (req, res) => {
  await handleWebhook(bot, req.body);
  res.send("OK");
});

bot.telegram.deleteWebhook({ drop_pending_updates: true });
bot.launch();
app.listen(3000, () => console.log("Server running on 3000"));
console.log("AstraGuardVPN bot started");
