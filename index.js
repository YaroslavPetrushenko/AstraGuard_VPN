const { Telegraf, Markup } = require("telegraf");
const db = require("./modules/db");
const keygen = require("./modules/vpn/keygen");
const promo = require("./modules/promo/promo");
const support = require("./modules/support/support");
const { attachCheckHandler } = require("./modules/payments/checker");
const { attachPaymentAdminHandlers } = require("./modules/payments/admin");
const { BOT_TOKEN, ADMINS, REF_BONUS_DAYS, TARIFFS, YOOMONEY_WALLET } = require("./config");
const yoomoney = require("./modules/payments/yoomoney");

const bot = new Telegraf(BOT_TOKEN);

// --- УТИЛИТЫ ---
function isAdmin(id) {
  return ADMINS.includes(id);
}

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
    ...TARIFFS.map(t => [Markup.button.callback(t.label, t.callback)]),
    [Markup.button.callback("⬅ Назад", "back_main")]
  ]);
}

function supportMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✏ Написать сообщение", "support_write")],
    [Markup.button.callback("⬅ Назад", "back_main")]
  ]);
}

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

  // Рефералка
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

        db.prepare(`
          INSERT INTO ref_bonus (user_id, days, created_at)
          VALUES (?, ?, datetime('now'))
        `).run(referrer, REF_BONUS_DAYS);

        ctx.telegram.sendMessage(
          referrer,
          `🎉 Твой друг присоединился по реферальной ссылке!\nТебе начислено +${REF_BONUS_DAYS} дня.`
        );
      }
    }
  }

  ctx.reply(
    "Добро пожаловать в *AstraGuardVPN*!\n\nВыбери действие:",
    { ...mainMenu(), parse_mode: "Markdown" }
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

async function askPromo(ctx, planDays, basePrice) {
  const userId = ctx.from.id;

  db.prepare(`DELETE FROM purchases WHERE user_id = ?`).run(userId);

  db.prepare(`
    INSERT INTO purchases (user_id, days, base_price, promo_id)
    VALUES (?, ?, ?, NULL)
  `).run(userId, planDays, basePrice);

  await ctx.reply(
    "Если у тебя есть промокод — введи его сообщением.\nИли нажми кнопку:",
    Markup.inlineKeyboard([[Markup.button.callback("Пропустить", "promo_skip")]])
  );
}

TARIFFS.forEach(t => {
  bot.action(t.callback, async (ctx) => {
    await ctx.answerCbQuery();
    await askPromo(ctx, t.days, t.price);
  });
});

bot.action("promo_skip", async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from.id;
  const purchase = db.prepare(`SELECT * FROM purchases WHERE user_id = ?`).get(userId);
  if (!purchase) return ctx.reply("Покупка не найдена.", mainMenu());

  const amount = purchase.base_price;
  const code = yoomoney.createPayment(userId, amount, purchase.days);

  ctx.reply(
    `💳 *Оплата через ЮMoney*\n\nПереведи *${amount}₽* на кошелёк:\n\`${YOOMONEY_WALLET}\`\n\nВ комментарии укажи код:\n\`${code}\`\n\nПосле оплаты отправь *чек* сюда.`,
    { parse_mode: "Markdown" }
  );
});

// --- ТЕКСТ: ПРОМОКОД / САППОРТ ---
bot.on("text", async (ctx, next) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  // очищаем покупку при любом сообщении
  db.prepare(`DELETE FROM purchases WHERE user_id = ?`).run(userId);

  // если админ — пропускаем
  if (isAdmin(userId)) return next();

  // если пользователь отвечает админу
  const wait = db.prepare(`SELECT * FROM reply_wait WHERE user_id = ?`).get(userId);
  if (wait) {
    db.prepare(`DELETE FROM reply_wait WHERE user_id = ?`).run(userId);

    const adminId = wait.admin_id;

    support.saveUserMessage(userId, text);

    bot.telegram.sendMessage(
      adminId,
      `📩 *Ответ от пользователя ${userId}:*\n${text}`,
      { parse_mode: "Markdown" }
    );

    return ctx.reply("Сообщение отправлено.", mainMenu());
  }

  // обычное сообщение в поддержку
  support.saveUserMessage(userId, text);

  ADMINS.forEach(a => {
    bot.telegram.sendMessage(a, `📩 Новое сообщение от ${userId}:\n${text}`);
  });

  ctx.reply("Сообщение отправлено в поддержку.", mainMenu());
});

// --- ПОЛУЧЕНИЕ ЧЕКОВ ---
attachCheckHandler(bot, mainMenu);

// --- САППОРТ ---
bot.action("support", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply("🛠 Выбери действие:", supportMenu());
});

bot.action("support_write", async (ctx) => {
  await ctx.answerCbQuery();

  db.prepare(`DELETE FROM purchases WHERE user_id = ?`).run(ctx.from.id);

  ctx.reply("✏ Напиши сообщение, и админ ответит.");
});

bot.action("back_main", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText("Выбери действие:", mainMenu());
});

// --- КНОПКИ: ОТВЕТИТЬ / ЗАКРЫТЬ ---
bot.action(/support_reply_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const adminId = Number(ctx.match[1]);

  db.prepare(`
    INSERT OR REPLACE INTO reply_wait (user_id, admin_id)
    VALUES (?, ?)
  `).run(ctx.from.id, adminId);

  ctx.reply("✏ Напиши свой ответ:");
});

bot.action("support_close", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText("Диалог закрыт. Если понадобится помощь — напиши снова.");
});

// --- ОТВЕТ АДМИНА ---
bot.on("message", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  if (ctx.reply_to_message && ctx.reply_to_message.text) {
    const match = ctx.reply_to_message.text.match(/(\d+)/);
    if (!match) return;

    const userId = Number(match[1]);
    const text = ctx.message.text;

    support.saveAdminReply(userId, text);

    ctx.telegram.sendMessage(
      userId,
      `🛠 *Ответ поддержки:*\n${text}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✏ Ответить", callback_data: `support_reply_${ctx.from.id}` }],
            [{ text: "❌ Закрыть", callback_data: "support_close" }]
          ]
        }
      }
    );
  }
});

// --- РЕФЕРАЛКА ---
bot.action("referral", async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from.id;
  const link = `https://t.me/${ctx.botInfo.username}?start=ref_${userId}`;

  const count = db.prepare(`SELECT COUNT(*) AS c FROM referrals WHERE user_id = ?`).get(userId).c;
  const bonus = db.prepare(`SELECT SUM(days) AS d FROM ref_bonus WHERE user_id = ?`).get(userId).d || 0;

  ctx.reply(
    `👥 *Реферальная программа AstraGuardVPN*\n\nТвоя ссылка:\n${link}\n\nПриглашено: *${count}*\nБонусных дней: *${bonus}*`,
    { parse_mode: "Markdown" }
  );
});

// --- МОИ VPN ---
bot.action("myvpn", async (ctx) => {
  await ctx.answerCbQuery();
  const keys = await keygen.getUserKeys(ctx.from.id);

  if (!keys || keys.length === 0) {
    return ctx.reply("У тебя пока нет активных VPN-ключей.", mainMenu());
  }

  let text = "🔑 *Твои VPN-ключи:*\n\n";
  keys.forEach(k => {
    text += `• ${k.url} — ${k.days} дней\n`;
  });

  ctx.reply(text, { parse_mode: "Markdown" });
});

// --- ПЛАТЁЖНЫЕ АДМИН-ХЕНДЛЕРЫ ---
attachPaymentAdminHandlers(bot);

// --- ЗАПУСК ---
bot.launch();
console.log("Бот запущен!");
