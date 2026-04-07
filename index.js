require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");
const crypto = require("crypto");

const { BOT_TOKEN } = require("./config");
const { pool } = require("./db");

const {
  createUserIfNotExists,
  getUser,
} = require("./users");

const {
  createTicket,
  getUserOpenTicket,
  addUserMessage,
} = require("./tickets");

const {
  getPromocode,
  hasUserUsedPromo,
  markPromoUsed,
} = require("./promocodes");

const {
  createPayment,
  getRemotePaymentStatus,
  getPendingPayments,
  updatePaymentStatus,
} = require("./payments");

const {
  createVpnKey,
  getUserActiveKeys,
  deactivateExpiredKeys,
} = require("./keys");

const express = require("express");
const app = express();

// Telegram шлёт JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Инициализация бота
const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 0 });

// ===============================
// /start
// ===============================
bot.start(async (ctx) => {
  const payload = ctx.startPayload;

  if (payload === "success") {
    return ctx.reply("🎉 Оплата прошла успешно! Доступ будет выдан автоматически в течение минуты.");
  }

  if (payload === "fail") {
    return ctx.reply("❌ Оплата не была завершена. Попробуй снова.");
  }

  const user = ctx.from;
  await createUserIfNotExists(user);

  const me = await getUser(user.id);

  let helloName =
    me.first_name ||
    me.username ||
    String(me.user_id);

  ctx.reply(
    `Привет, ${helloName}!\n\n` +
    "Это клиентский бот AstraGuardVPN.\n" +
    "Здесь ты можешь:\n" +
    "• обратиться в поддержку\n" +
    "• купить VPN\n" +
    "• применить промокод\n" +
    "• посмотреть свои ключи",
    Markup.keyboard([
      ["🛠 Поддержка", "💳 Купить VPN"],
      ["🎟 Промокод", "🔑 Мои ключи"],
    ]).resize()
  );
});

// ===============================
// Поддержка
// ===============================
bot.hears("🛠 Поддержка", async (ctx) => {
  const userId = ctx.from.id;

  const existing = await getUserOpenTicket(userId);
  if (existing) {
    return ctx.reply(
      `У тебя уже есть открытый тикет: ${existing.ticket_id}\n` +
      "Напиши сообщение, чтобы продолжить диалог с поддержкой."
    );
  }

  const ticketId = "T-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  await createTicket(ticketId, userId);

  ctx.reply(
    `Создан тикет: ${ticketId}\n` +
    "Опиши свою проблему одним или несколькими сообщениями."
  );
});

// ===============================
// Обработка текстов (тикеты + промокоды)
// ===============================
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  // 1. Если есть открытый тикет
  const ticket = await getUserOpenTicket(userId);
  if (ticket) {
    await addUserMessage(ticket.ticket_id, text);
    return ctx.reply("Сообщение отправлено в поддержку. Ожидай ответа администратора.");
  }

  // 2. Промокод
  if (/^[A-Za-z0-9]{3,32}$/.test(text)) {
    const code = text.toUpperCase();
    const promo = await getPromocode(code);

    if (promo) {
      if (promo.uses_left <= 0) {
        return ctx.reply("Этот промокод больше недоступен.");
      }

      const used = await hasUserUsedPromo(userId, code);
      if (used) {
        return ctx.reply("Ты уже использовал этот промокод.");
      }

      await markPromoUsed(userId, code);

      return ctx.reply(
        `🎉 Промокод применён!\n` +
        `Скидка: ${promo.discount}%\n` +
        `Осталось использований: ${promo.uses_left - 1}`
      );
    }
  }
});

// ===============================
// Покупка VPN
// ===============================
bot.hears("💳 Купить VPN", async (ctx) => {
  ctx.reply(
    "Выбери тариф:",
    Markup.inlineKeyboard([
      [Markup.button.callback("30 дней — 299₽", "buy_30")],
      [Markup.button.callback("90 дней — 699₽", "buy_90")],
      [Markup.button.callback("180 дней — 1199₽", "buy_180")],
    ])
  );
});

bot.action(/buy_(.+)/, async (ctx) => {
  const plan = ctx.match[1];
  const userId = ctx.from.id;

  const prices = {
    "30": 299,
    "90": 699,
    "180": 1199,
  };

  const days = Number(plan);
  const amount = prices[plan];

  if (!days || !amount) {
    return ctx.answerCbQuery("Неверный тариф.");
  }

  try {
    const payment = await createPayment(userId, days, amount);

    await ctx.reply(
      `Оплата тарифа на ${days} дней.\n` +
      `Сумма: ${amount}₽\n\n` +
      `Перейди по ссылке для оплаты:\n${payment.pay_url}\n\n` +
      "После оплаты бот автоматически выдаст VPN‑ключ."
    );

    ctx.answerCbQuery("Ссылка на оплату отправлена.");
  } catch (e) {
    console.error("createPayment error:", e.message);
    ctx.answerCbQuery("Ошибка создания платежа.");
    ctx.reply("Не удалось создать платёж. Попробуй позже.");
  }
});

// ===============================
// Мои ключи
// ===============================
bot.hears("🔑 Мои ключи", async (ctx) => {
  const userId = ctx.from.id;

  await deactivateExpiredKeys();
  const keys = await getUserActiveKeys(userId);

  if (!keys.length) {
    return ctx.reply("У тебя пока нет активных VPN‑ключей.");
  }

  let text = "Твои активные ключи:\n\n";
  for (const k of keys) {
    const exp = new Date(k.expires_at).toLocaleString("ru-RU");
    text +=
      `🔑 ${k.key}\n` +
      `Срок: ${k.days} дней\n` +
      `До: ${exp}\n` +
      `Устройств: ${k.devices}\n` +
      `Трафик: ${k.traffic}\n\n`;
  }

  ctx.reply(text);
});

// ===============================
// Фоновая обработка платежей
// ===============================
async function processPayments() {
  try {
    const pending = await getPendingPayments(50);
    if (!pending.length) return;

    for (const p of pending) {
      const status = await getRemotePaymentStatus(p.pay_id);

      if (status === "pending") continue;

      if (status === "paid") {
        await updatePaymentStatus(p.id, "paid");

        const keyRow = await createVpnKey(p.user_id, p.days, 1, "unlimited");
        const exp = new Date(keyRow.expires_at).toLocaleString("ru-RU");

        await bot.telegram.sendMessage(
          p.user_id,
          `🎉 Оплата получена!\n\n` +
          `Твой VPN‑ключ:\n\`${keyRow.key}\`\n\n` +
          `Срок: ${keyRow.days} дней (до ${exp})\n` +
          `Устройств: ${keyRow.devices}\n` +
          `Трафик: ${keyRow.traffic}`,
          { parse_mode: "Markdown" }
        );
      } else if (status === "canceled") {
        await updatePaymentStatus(p.id, "canceled");
        await bot.telegram.sendMessage(
          p.user_id,
          "Платёж был отменён. Если это ошибка — попробуй оплатить снова."
        );
      } else {
        await updatePaymentStatus(p.id, "error");
      }
    }
  } catch (e) {
    console.error("processPayments error:", e.message);
  }
}

// ===============================
// Доставка сообщений админа
// ===============================
async function deliverAdminMessages() {
  try {
    const res = await pool.query(
      `
      SELECT m.id, m.ticket_id, m.text, t.user_id
      FROM messages m
      JOIN tickets t ON t.ticket_id = m.ticket_id
      WHERE m.sender = 'admin'
        AND (m.delivered IS NULL OR m.delivered = FALSE)
      ORDER BY m.id ASC
      LIMIT 50
      `
    );

    for (const msg of res.rows) {
      await bot.telegram.sendMessage(
        msg.user_id,
        `💬 Ответ поддержки:\n${msg.text}`
      );

      await pool.query(
        `UPDATE messages SET delivered = TRUE WHERE id = $1`,
        [msg.id]
      );
    }
  } catch (e) {
    console.error("deliverAdminMessages error:", e.message);
  }
}

// ===============================
// Webhook + сервер
// ===============================

// Устанавливаем webhook ДО запуска сервера
bot.telegram.setWebhook("https://astraguardvpn-production.up.railway.app/webhook");

// Обработчик webhook
app.post("/webhook", (req, res) => {
  bot.handleUpdate(req.body)
    .then(() => res.sendStatus(200))
    .catch((err) => {
      console.error("Webhook error:", err);
      res.sendStatus(200);
    });
});

// Health-check
app.get("/", (req, res) => res.send("OK"));

// Запуск сервера
app.listen(process.env.PORT || 3000, () => {
  console.log("Client bot running via webhook");
});

// Фоновые задачи
setInterval(processPayments, 5000);
setInterval(deliverAdminMessages, 3000);
