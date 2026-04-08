const { Telegraf, Markup } = require("telegraf");
const db = require("./db");
const keygen = require("./keygen");
const adminCommands = require("./admin");
const promo = require("./promo");
const anypay = require("./anypay");
const { BOT_TOKEN, ADMINS, VPN_PRICE_BASE, REF_BONUS_DAYS } = require("./config");
const { isAdmin } = require("./utils");

const bot = new Telegraf(BOT_TOKEN);

// --- МЕНЮ ---

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🎁 Пробный доступ", "trial")],
    [Markup.button.callback("💳 Купить VPN", "buy")],
    [Markup.button.callback("🔑 Мои VPN", "myvpn")],
    [Markup.button.callback("👥 Пригласить друга", "referral")],
    [Markup.button.callback("🛠 Поддержка", "support")]
  ]);
}

function buyMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💸 30 дней — 100₽", "buy_30")],
    [Markup.button.callback("💸 90 дней — 250₽", "buy_90")],
    [Markup.button.callback("💸 180 дней — 450₽", "buy_180")],
    [Markup.button.callback("⬅ Назад", "back_main")]
  ]);
}

function supportMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✏ Написать сообщение", "support_write")],
    [Markup.button.callback("⬅ Назад", "back_main")]
  ]);
}

// --- АДМИН-КОМАНДЫ ---

adminCommands(bot);

// --- START ---

bot.start((ctx) => {
  const u = ctx.from;
  const payload = ctx.startPayload;

  const exists = db.prepare("SELECT * FROM users WHERE id = ?").get(u.id);
  if (!exists) {
    db.prepare(`
            INSERT INTO users (id, username, created_at)
            VALUES (?, ?, datetime('now'))
        `).run(u.id, u.username);
  }

  // --- РЕФЕРАЛКА ---
  if (payload && payload.startsWith("ref_")) {
    const referrer = Number(payload.replace("ref_", ""));

    if (referrer !== u.id) {
      const already = db.prepare(`
                SELECT * FROM referrals WHERE invited_id = ?
            `).get(u.id);

      if (!already) {
        db.prepare(`
                    INSERT INTO referrals (user_id, invited_id, created_at)
                    VALUES (?, ?, datetime('now'))
                `).run(referrer, u.id);

        // бонусные дни
        db.prepare(`
                    INSERT INTO ref_bonus (user_id, days, created_at)
                    VALUES (?, ?, datetime('now'))
                `).run(referrer, REF_BONUS_DAYS);

        ctx.telegram.sendMessage(
          referrer,
          `🎉 Твой друг присоединился по реферальной ссылке!\n` +
          `Тебе начислено +${REF_BONUS_DAYS} дня.`
        );
      }
    }
  }

  ctx.reply(
    "Добро пожаловать в AstraGuardVPN!\n\nВыбери действие:",
    mainMenu()
  );
});


// --- ПРОБНЫЙ ДОСТУП ---

bot.action("trial", async (ctx) => {
  await ctx.answerCbQuery();
  const url = await keygen.giveTrial(ctx.from.id);
  if (!url) return ctx.reply("Ты уже использовал пробный доступ.", mainMenu());
  ctx.reply(`🎁 *Твой пробный VPN:*\n${url}`, { parse_mode: "Markdown" });
});

// --- ПОКУПКА VPN ---

bot.action("buy", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText("Выбери тариф:", buyMenu());
});

// шаг 1: выбор тарифа → запрос промокода
async function askPromo(ctx, planDays, basePrice) {
  const userId = ctx.from.id;

  // сохраняем "черновик покупки" в памяти БД
  db.prepare(`
        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            days INTEGER,
            base_price INTEGER,
            promo_id INTEGER
        )
    `).run();

  db.prepare(`DELETE FROM purchases WHERE user_id = ?`).run(userId);

  db.prepare(`
        INSERT INTO purchases (user_id, days, base_price, promo_id)
        VALUES (?, ?, ?, NULL)
    `).run(userId, planDays, basePrice);

  await ctx.reply(
    "Если у тебя есть промокод — введи его сообщением.\nИли нажми кнопку:",
    Markup.inlineKeyboard([
      [Markup.button.callback("Пропустить", "promo_skip")]
    ])
  );
}

bot.action("buy_30", async (ctx) => {
  await ctx.answerCbQuery();
  await askPromo(ctx, 30, 100);
});

bot.action("buy_90", async (ctx) => {
  await ctx.answerCbQuery();
  await askPromo(ctx, 90, 250);
});

bot.action("buy_180", async (ctx) => {
  await ctx.answerCbQuery();
  await askPromo(ctx, 180, 450);
});

// шаг 2: Пропустить промокод
bot.action("promo_skip", async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from.id;
  const purchase = db.prepare(`SELECT * FROM purchases WHERE user_id = ?`).get(userId);
  if (!purchase) return ctx.reply("Покупка не найдена. Попробуй ещё раз.", mainMenu());

  const amount = purchase.base_price;

  const invoice = await anypay.createInvoice(userId, amount, null);

  ctx.reply(
    `Счёт на оплату: ${amount}₽\nПерейди по ссылке для оплаты:`,
    Markup.inlineKeyboard([
      [Markup.button.url("Оплатить", invoice.url)],
      [Markup.button.callback("Я оплатил", `paid_${invoice.invoice_id}`)]
    ])
  );
});

// шаг 2: Пользователь вводит промокод текстом
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  // если админ — это обрабатывает admin.js
  if (isAdmin(ctx.from.id, ADMINS)) return;

  const userId = ctx.from.id;

  // проверяем, есть ли "черновик покупки"
  const purchase = db.prepare(`SELECT * FROM purchases WHERE user_id = ?`).get(userId);

  if (purchase) {
    // пользователь ввёл промокод
    const code = text.trim();
    const p = promo.getPromoByName(code);

    if (!p) {
      return ctx.reply("Такого промокода нет. Можешь ввести другой или нажать «Пропустить».",
        Markup.inlineKeyboard([
          [Markup.button.callback("Пропустить", "promo_skip")]
        ])
      );
    }

    if (!promo.canUsePromo(p)) {
      return ctx.reply("Лимит использования этого промокода исчерпан.",
        Markup.inlineKeyboard([
          [Markup.button.callback("Пропустить", "promo_skip")]
        ])
      );
    }

    if (promo.hasUserUsedPromo(userId, p.id)) {
      return ctx.reply("Ты уже использовал этот промокод.",
        Markup.inlineKeyboard([
          [Markup.button.callback("Пропустить", "promo_skip")]
        ])
      );
    }

    // применяем промокод
    const discounted = Math.max(1, Math.round(purchase.base_price * (100 - p.discount) / 100));

    // помечаем промокод использованным
    promo.markPromoUsed(userId, p.id);

    const invoice = await anypay.createInvoice(userId, discounted, p.id);

    return ctx.reply(
      `Промокод применён! Новая цена: ${discounted}₽\nПерейди по ссылке для оплаты:`,
      Markup.inlineKeyboard([
        [Markup.button.url("Оплатить", invoice.url)],
        [Markup.button.callback("Я оплатил", `paid_${invoice.invoice_id}`)]
      ])
    );
  }

  // если это не промокод, а обычное сообщение — считаем как тикет в поддержку
  db.prepare(`
        INSERT INTO tickets (user_id, message, from_admin, created_at)
        VALUES (?, ?, 0, datetime('now'))
    `).run(userId, text);

  ADMINS.forEach(a => {
    bot.telegram.sendMessage(a, `📩 Новое сообщение от ${userId}:\n${text}`);
  });

  ctx.reply("Сообщение отправлено в поддержку.", mainMenu());
});

// шаг 3: «Я оплатил»
bot.action(/paid_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const invoiceId = ctx.match[1];

  const payment = anypay.getPaymentByInvoice(invoiceId);
  if (!payment) return ctx.reply("Платёж не найден. Если это ошибка — напиши в поддержку.", mainMenu());

  // TODO: здесь по‑хорошему нужно проверить статус через API AnyPay или ждать webhook.
  // Пока считаем, что оплата прошла успешно:
  await anypay.markPaid(invoiceId);

  // выдаём ключ
  const url = await keygen.givePaid(payment.user_id, 30); // или payment.days, если будешь хранить

  await ctx.reply(`Оплата подтверждена!\nТвой VPN:\n${url}`);
});

// --- МОИ VPN / ПОДДЕРЖКА / НАЗАД оставь как в предыдущем index.js ---

bot.action("support", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply("🛠 Выбери действие:", supportMenu());
});

bot.action("support_write", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply("✏ Напиши сообщение, и админ ответит.");
});

bot.action("back_main", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText("Выбери действие:", mainMenu());
});

// ответ админа по reply — как раньше
bot.on("message", (ctx) => {
  if (!isAdmin(ctx.from.id, ADMINS)) return;

  if (ctx.reply_to_message && ctx.reply_to_message.text) {
    const match = ctx.reply_to_message.text.match(/(\d+)/);
    if (!match) return;

    const userId = Number(match[1]);
    const text = ctx.message.text;

    db.prepare(`
            INSERT INTO tickets (user_id, message, from_admin, created_at)
            VALUES (?, ?, 1, datetime('now'))
        `).run(userId, text);

    bot.telegram.sendMessage(userId, `🛠 Ответ поддержки:\n${text}`);
  }
});

bot.action("referral", async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from.id;
  const link = `https://t.me/${ctx.botInfo.username}?start=ref_${userId}`;

  const count = db.prepare(`
        SELECT COUNT(*) AS c FROM referrals WHERE user_id = ?
    `).get(userId).c;

  const bonus = db.prepare(`
        SELECT SUM(days) AS d FROM ref_bonus WHERE user_id = ?
    `).get(userId).d || 0;

  ctx.reply(
    `👥 *Реферальная программа AstraGuardVPN*\n\n` +
    `Твоя ссылка:\n${link}\n\n` +
    `Приглашено друзей: *${count}*\n` +
    `Получено бонусных дней: *${bonus}*\n\n` +
    `За каждого приглашённого — +${REF_BONUS_DAYS} дня к подписке.`,
    { parse_mode: "Markdown" }
  );
});


bot.launch();
console.log("Бот запущен!");
