// ===============================
// CONFIG
// ===============================
const TELEGRAM_BOT_TOKEN = "8524463400:AAHXm2_YpkdXg8lY9aa8fZ_5ZTWwyUiB9HE";
const KASSA_API_KEY = "API_KEY_KASSA_AI";
const KASSA_SHOP_ID = "SHOP_ID_KASSA_AI";
const KASSA_CREATE_URL = "https://paymentt.kassa.ai/api/v1/invoice";
const WEBHOOK_URL = "https://ТВОЙ_ДОМЕН/kassa/webhook";

const REFERRAL_BONUS_DAYS = 5;
const TRIAL_DAYS = 1;

// Тарифы
const TARIFFS = [
  { id: "7d", title: "7 дней", days: 7, price: 49 },
  { id: "30d", title: "30 дней", days: 30, price: 149 },
  { id: "90d", title: "90 дней", days: 90, price: 349 },
  { id: "180d", title: "180 дней", days: 180, price: 599 },
  { id: "365d", title: "365 дней", days: 365, price: 999 },
];

// Твой Telegram ID (админ)
const ADMIN_ID = 6784875182; // <-- ВСТАВЬ СВОЙ ID

// ===============================
// DEPENDENCIES
// ===============================
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { Telegraf, Markup } = require("telegraf");

// ===============================
// STORAGE (in-memory)
// ===============================
const users = new Map();
const payments = new Map();
const userState = new Map();

function getUser(id) {
  if (!users.has(id)) {
    users.set(id, {
      subscriptionUntil: null,
      referralCode: `AG-${id}`,
      referredBy: null,
      invitedCount: 0,
      paidCount: 0,
      trialUsed: false,
      lastKey: null,
    });
  }
  return users.get(id);
}

function saveUser(id, data) {
  users.set(id, { ...getUser(id), ...data });
}

function findUserByReferralCode(code) {
  for (const [id, user] of users.entries()) {
    if (user.referralCode === code) return { id, ...user };
  }
  return null;
}

function generateOrderId(userId, tariffId) {
  return `ORD-${userId}-${tariffId}-${Date.now()}`;
}

function generateKey() {
  return "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function formatDate(ts) {
  if (!ts) return "нет";
  return new Date(ts).toLocaleString("ru-RU");
}

// ===============================
// TELEGRAM BOT
// ===============================
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Авто‑добавление всех пользователей
bot.on("message", (ctx, next) => {
  getUser(ctx.from.id);
  return next();
});

function mainMenu() {
  return Markup.keyboard([
    ["🚀 Мой VPN", "💳 Купить подписку"],
    ["🆓 Пробный доступ", "👥 Реферальная программа"],
    ["📱 Как подключиться?", "ℹ️ О сервисе"],
    ["💬 Поддержка"],
  ]).resize();
}

bot.start((ctx) => {
  const user = getUser(ctx.from.id);
  ctx.reply(
    `Привет, ${ctx.from.first_name}!\n\n` +
    `Твой реферальный код: ${user.referralCode}\n\n` +
    `Выбери действие в меню ниже.`,
    mainMenu()
  );
});

// ===============================
// МЕНЮ: МОЙ VPN
// ===============================
bot.hears("🚀 Мой VPN", (ctx) => {
  const user = getUser(ctx.from.id);
  const until = user.subscriptionUntil
    ? formatDate(user.subscriptionUntil)
    : "подписка не активна";

  const keyText = user.lastKey
    ? `Твой последний ключ:\n\`${user.lastKey}\``
    : "Ключ ещё не выдавался.";

  ctx.reply(
    `📦 *Мой VPN*\n\n` +
    `Статус подписки: ${until}\n\n` +
    `${keyText}`,
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// ===============================
// МЕНЮ: ПРОБНЫЙ ДОСТУП
// ===============================
bot.hears("🆓 Пробный доступ", (ctx) => {
  const userId = ctx.from.id;
  const user = getUser(userId);

  if (user.trialUsed) {
    return ctx.reply(
      "Пробный доступ уже был активирован ранее.",
      mainMenu()
    );
  }

  const now = Date.now();
  const trialUntil = now + TRIAL_DAYS * 86400000;
  const key = generateKey();

  saveUser(userId, {
    trialUsed: true,
    subscriptionUntil: trialUntil,
    lastKey: key,
  });

  ctx.reply(
    `🆓 Пробный доступ активирован на ${TRIAL_DAYS} день.\n\n` +
    `Подписка активна до: ${formatDate(trialUntil)}\n` +
    `Твой ключ:\n\`${key}\``,
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// ===============================
// МЕНЮ: РЕФЕРАЛЬНАЯ ПРОГРАММА
// ===============================
bot.hears("👥 Реферальная программа", (ctx) => {
  const user = getUser(ctx.from.id);

  ctx.reply(
    `👥 *Реферальная программа*\n\n` +
    `Твой реферальный код:\n\`${user.referralCode}\`\n\n` +
    `Приглашено всего: ${user.invitedCount}\n` +
    `Из них оплатили: ${user.paidCount}\n\n` +
    `Делись кодом с друзьями — за каждую оплату по твоему коду ты получаешь +${REFERRAL_BONUS_DAYS} дней к подписке.`,
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// ===============================
// МЕНЮ: КАК ПОДКЛЮЧИТЬСЯ
// ===============================
bot.hears("📱 Как подключиться?", (ctx) => {
  ctx.reply(
    "📱 *Как подключиться к VPN*\n\n" +
    "1. Установи приложение VPN (WireGuard / OpenVPN / другое — как у тебя реально).\n" +
    "2. Вставь выданный ключ или импортируй конфиг.\n" +
    "3. Нажми «Подключиться».\n\n" +
    "Если что-то не получается — напиши в поддержку.",
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// ===============================
// МЕНЮ: О СЕРВИСЕ
// ===============================
bot.hears("ℹ️ О сервисе", (ctx) => {
  ctx.reply(
    "ℹ️ *О сервисе AstraGuardVPN*\n\n" +
    "• Высокая скорость и стабильные сервера.\n" +
    "• Защита трафика и конфиденциальность.\n" +
    "• Удобная оплата и автоматическая выдача ключей.\n" +
    "• Реферальная программа с бонусными днями.\n\n" +
    "Сервис создан для комфортного и безопасного доступа к сети.",
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// ===============================
// МЕНЮ: ПОДДЕРЖКА
// ===============================
bot.hears("💬 Поддержка", (ctx) => {
  ctx.reply(
    "Напишите ваш вопрос одним сообщением. Техподдержка ответит вам в ближайшее время.",
    mainMenu()
  );
  userState.set(ctx.from.id, { step: "support_waiting" });
});

// ===============================
// МЕНЮ: КУПИТЬ ПОДПИСКУ
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
bot.action(/tariff_(.+)/, async (ctx) => {
  const tariffId = ctx.match[1];
  const tariff = TARIFFS.find((t) => t.id === tariffId);
  if (!tariff) return ctx.answerCbQuery("Ошибка: тариф не найден");

  userState.set(ctx.from.id, { step: "promo", tariffId });

  await ctx.answerCbQuery();
  await ctx.reply(
    `Ты выбрал: ${tariff.title} за ${tariff.price}₽.\n\n` +
    `Если есть промокод — отправь его.\nЕсли нет — напиши: "нет".`
  );
});

// ===============================
// ОБРАБОТКА ТЕКСТОВ: ПОДДЕРЖКА / ПРОМОКОД
// ===============================
bot.on("text", async (ctx, next) => {
  const state = userState.get(ctx.from.id);

  // Вопрос в поддержку
  if (state && state.step === "support_waiting") {
    const question = ctx.message.text;

    await ctx.reply(
      "Ваш вопрос отправлен. Ожидайте ответа от техподдержки.",
      mainMenu()
    );

    await bot.telegram.sendMessage(
      ADMIN_ID,
      `🆘 *Новый вопрос в поддержку*\n\n` +
      `От: ${ctx.from.first_name} (@${ctx.from.username || "нет"})\n` +
      `ID: ${ctx.from.id}\n\n` +
      `Вопрос:\n${question}`,
      { parse_mode: "Markdown" }
    );

    userState.delete(ctx.from.id);
    return;
  }

  // Промокод
  if (!state || state.step !== "promo") return next();

  const text = ctx.message.text.trim();
  let referrerId = null;

  if (text.toLowerCase() !== "нет") {
    const refUser = findUserByReferralCode(text);
    if (!refUser) return ctx.reply("Промокод не найден.");
    if (String(refUser.id) === String(ctx.from.id))
      return ctx.reply("Нельзя использовать свой промокод.");
    referrerId = refUser.id;
  }

  const tariff = TARIFFS.find((t) => t.id === state.tariffId);
  if (!tariff) return ctx.reply("Ошибка: тариф не найден.");

  const orderId = generateOrderId(ctx.from.id, tariff.id);

  payments.set(orderId, {
    userId: ctx.from.id,
    tariffId: tariff.id,
    referrerId,
    status: "pending",
  });

  // если есть реферер — увеличим invitedCount (приглашён)
  if (referrerId) {
    const refUser = getUser(referrerId);
    saveUser(referrerId, {
      invitedCount: (refUser.invitedCount || 0) + 1,
    });
  }

  try {
    const res = await axios.post(
      KASSA_CREATE_URL,
      {
        shop_id: KASSA_SHOP_ID,
        amount: tariff.price,
        order_id: orderId,
        description: `Подписка ${tariff.title}`,
        callback_url: WEBHOOK_URL,
      },
      {
        headers: {
          Authorization: `Bearer ${KASSA_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const payUrl = res.data.url || res.data.payment_url;
    userState.delete(ctx.from.id);

    ctx.reply(
      `Отлично!\nОплати по ссылке:\n${payUrl}\n\n` +
      `После оплаты подписка активируется автоматически.`,
      mainMenu()
    );
  } catch (err) {
    console.log(err.response?.data || err);
    ctx.reply("Ошибка при создании платежа.", mainMenu());
  }
});

// ===============================
// WEBHOOK SERVER
// ===============================
const app = express();
app.use(bodyParser.json());

app.post("/kassa/webhook", async (req, res) => {
  const data = req.body;
  console.log("Webhook:", data);

  const { order_id, status } = data;
  const payment = payments.get(order_id);

  if (!payment) return res.send("OK");

  if (status !== "success") {
    payment.status = "failed";
    return res.send("OK");
  }

  payment.status = "success";

  const { userId, tariffId, referrerId } = payment;
  const tariff = TARIFFS.find((t) => t.id === tariffId);

  const user = getUser(userId);
  const now = Date.now();
  const current = user.subscriptionUntil > now ? user.subscriptionUntil : now;

  let newUntil =
    current +
    tariff.days * 86400000 +
    (referrerId ? REFERRAL_BONUS_DAYS * 86400000 : 0);

  const key = generateKey();

  saveUser(userId, {
    subscriptionUntil: newUntil,
    lastKey: key,
  });

  // рефереру — бонусные дни + paidCount++
  if (referrerId) {
    const refUser = getUser(referrerId);
    const refNow = Date.now();
    const refCurrent =
      refUser.subscriptionUntil > refNow ? refUser.subscriptionUntil : refNow;
    const refNew = refCurrent + REFERRAL_BONUS_DAYS * 86400000;
    saveUser(referrerId, {
      subscriptionUntil: refNew,
      paidCount: (refUser.paidCount || 0) + 1,
    });

    bot.telegram.sendMessage(
      referrerId,
      `🎉 Твой промокод использовали! Тебе начислено +${REFERRAL_BONUS_DAYS} дней.`
    );
  }

  const untilDate = formatDate(newUntil);

  bot.telegram.sendMessage(
    userId,
    `✅ Оплата получена!\n\n` +
    `Подписка активна до: ${untilDate}\n` +
    `Твой ключ:\n\`${key}\``,
    { parse_mode: "Markdown" }
  );

  res.send("OK");
});
// ===============================
// PHOTO BROADCAST (рассылка фото)
// ===============================
bot.on("photo", async (ctx) => {
  // Проверяем, что это админ
  if (ctx.from.id !== ADMIN_ID) return;

  const caption = ctx.message.caption || "";
  if (!caption.startsWith("/photocast")) return;

  const text = caption.replace("/photocast", "").trim();
  const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

  await ctx.reply("Начинаю рассылку фото...");

  let success = 0;
  let failed = 0;

  for (const [userId] of users.entries()) {
    try {
      await bot.telegram.sendPhoto(userId, photoId, {
        caption: text,
      });
      success++;
    } catch (e) {
      failed++;
    }
  }

  ctx.reply(`Рассылка завершена.\nУспешно: ${success}\nОшибок: ${failed}`);
});

// ===============================
// BROADCAST (рассылка)
// ===============================
bot.command("broadcast", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const text = ctx.message.text.replace("/broadcast", "").trim();
  if (!text) return ctx.reply("Напиши текст рассылки после команды.");

  ctx.reply("Начинаю рассылку...");

  let success = 0;
  let failed = 0;

  for (const [userId] of users.entries()) {
    try {
      await bot.telegram.sendMessage(userId, text);
      success++;
    } catch (e) {
      failed++;
    }
  }

  ctx.reply(`Рассылка завершена.\nУспешно: ${success}\nОшибок: ${failed}`);
});

bot.command("sendto", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const args = ctx.message.text.split(" ");
  if (args.length < 3) {
    return ctx.reply("Использование: /sendto USER_ID текст");
  }

  const userId = args[1];
  const text = args.slice(2).join(" ");

  try {
    await bot.telegram.sendMessage(userId, text);
    ctx.reply("Отправлено.");
  } catch (e) {
    ctx.reply("Ошибка: пользователь недоступен.");
  }
});

// Ответ техподдержки
bot.command("reply", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const args = ctx.message.text.split(" ");
  if (args.length < 3) {
    return ctx.reply("Использование: /reply USER_ID текст ответа");
  }

  const userId = args[1];
  const text = args.slice(2).join(" ");

  try {
    await bot.telegram.sendMessage(
      userId,
      `📩 *Ответ от техподдержки:*\n\n${text}`,
      { parse_mode: "Markdown" }
    );
    ctx.reply("Ответ отправлен пользователю.");
  } catch (e) {
    ctx.reply("Ошибка: пользователь недоступен.");
  }
});

// ===============================
// START
// ===============================
bot.launch();
app.listen(3000, () => console.log("Webhook server on 3000"));
console.log("Bot started");
