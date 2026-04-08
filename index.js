const { Telegraf, Markup } = require("telegraf");
const db = require("./db");
const keygen = require("./keygen");
const adminCommands = require("./admin");
const { BOT_TOKEN, ADMINS } = require("./config");
const { isAdmin } = require("./utils");

const bot = new Telegraf(BOT_TOKEN);

// -------------------------
// КРАСИВЫЕ МЕНЮ
// -------------------------

function mainMenu() {
    return Markup.inlineKeyboard([
        [ Markup.button.callback("🎁 Пробный доступ", "trial") ],
        [ Markup.button.callback("💳 Купить VPN", "buy") ],
        [ Markup.button.callback("🔑 Мои VPN", "myvpn") ],
        [ Markup.button.callback("🛠 Поддержка", "support") ]
    ]);
}

function buyMenu() {
    return Markup.inlineKeyboard([
        [ Markup.button.callback("💸 30 дней — 100₽", "buy_30") ],
        [ Markup.button.callback("💸 90 дней — 250₽", "buy_90") ],
        [ Markup.button.callback("💸 180 дней — 450₽", "buy_180") ],
        [ Markup.button.callback("⬅ Назад", "back_main") ]
    ]);
}

function myVpnMenu() {
    return Markup.inlineKeyboard([
        [ Markup.button.callback("🔄 Обновить", "myvpn_refresh") ],
        [ Markup.button.callback("⬅ Назад", "back_main") ]
    ]);
}

function supportMenu() {
    return Markup.inlineKeyboard([
        [ Markup.button.callback("✏ Написать сообщение", "support_write") ],
        [ Markup.button.callback("⬅ Назад", "back_main") ]
    ]);
}

// -------------------------
// АДМИН-КОМАНДЫ
// -------------------------
adminCommands(bot);

// -------------------------
// СТАРТ
// -------------------------

bot.start((ctx) => {
    const u = ctx.from;

    const exists = db.prepare("SELECT * FROM users WHERE id = ?").get(u.id);
    if (!exists) {
        db.prepare(`
            INSERT INTO users (id, username, created_at)
            VALUES (?, ?, datetime('now'))
        `).run(u.id, u.username);
    }

    ctx.reply(
        "Добро пожаловать в AstraGuardVPN!\n\nВыбери действие:",
        mainMenu()
    );
});

// -------------------------
// ПРОБНЫЙ ДОСТУП
// -------------------------

bot.action("trial", async (ctx) => {
    await ctx.answerCbQuery();

    const url = await keygen.giveTrial(ctx.from.id);
    if (!url)
        return ctx.reply("Ты уже использовал пробный доступ.", mainMenu());

    ctx.reply(
        `🎁 *Твой пробный VPN:*\n${url}`,
        { parse_mode: "Markdown" }
    );
});

// -------------------------
// ПОКУПКА VPN
// -------------------------

bot.action("buy", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.editMessageText("Выбери тариф:", buyMenu());
});

bot.action("buy_30", async (ctx) => {
    await ctx.answerCbQuery();
    const url = await keygen.givePaid(ctx.from.id, 30);
    ctx.reply(`🔑 *VPN на 30 дней:*\n${url}`, { parse_mode: "Markdown" });
});

bot.action("buy_90", async (ctx) => {
    await ctx.answerCbQuery();
    const url = await keygen.givePaid(ctx.from.id, 90);
    ctx.reply(`🔑 *VPN на 90 дней:*\n${url}`, { parse_mode: "Markdown" });
});

bot.action("buy_180", async (ctx) => {
    await ctx.answerCbQuery();
    const url = await keygen.givePaid(ctx.from.id, 180);
    ctx.reply(`🔑 *VPN на 180 дней:*\n${url}`, { parse_mode: "Markdown" });
});

// -------------------------
// МОИ VPN
// -------------------------

bot.action("myvpn", async (ctx) => {
    await ctx.answerCbQuery();

    const rows = db.prepare("SELECT * FROM keys WHERE user_id = ?").all(ctx.from.id);

    if (!rows.length)
        return ctx.reply("У тебя нет активных VPN.", mainMenu());

    let msg = "🔑 *Твои VPN:*\n\n";
    rows.forEach(k => {
        msg += `• ${k.sub_url}\nдо: *${k.expires_at}*\n\n`;
    });

    ctx.reply(msg, { parse_mode: "Markdown", ...myVpnMenu() });
});

bot.action("myvpn_refresh", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.deleteMessage();
    ctx.reply("🔄 Обновлено!", mainMenu());
});

// -------------------------
// ПОДДЕРЖКА
// -------------------------

bot.action("support", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply("🛠 Выбери действие:", supportMenu());
});

bot.action("support_write", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.reply("✏ Напиши сообщение, и админ ответит.");
});

// -------------------------
// СООБЩЕНИЯ В ПОДДЕРЖКУ
// -------------------------

bot.on("text", (ctx) => {
    const text = ctx.message.text;

    // Игнорируем кнопки
    if (["🎁 Пробный доступ", "💳 Купить VPN", "🔑 Мои VPN", "🛠 Поддержка"].includes(text))
        return;

    // Если это админ — обработка ниже
    if (isAdmin(ctx.from.id, ADMINS)) return;

    // Запись тикета
    db.prepare(`
        INSERT INTO tickets (user_id, message, from_admin, created_at)
        VALUES (?, ?, 0, datetime('now'))
    `).run(ctx.from.id, text);

    // Уведомление админов
    ADMINS.forEach(a => {
        bot.telegram.sendMessage(a, `📩 Новое сообщение от ${ctx.from.id}:\n${text}`);
    });

    ctx.reply("Сообщение отправлено в поддержку.", mainMenu());
});

// -------------------------
// ОТВЕТ АДМИНА
// -------------------------

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

// -------------------------
// КНОПКА НАЗАД
// -------------------------

bot.action("back_main", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.editMessageText("Выбери действие:", mainMenu());
});

// -------------------------
// ЗАПУСК
// -------------------------

bot.launch();
console.log("Бот запущен!");
