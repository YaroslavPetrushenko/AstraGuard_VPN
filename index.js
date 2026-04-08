const { Telegraf } = require("telegraf");
const db = require("./db");
const { BOT_TOKEN, ADMINS } = require("./config");
const { isAdmin } = require("./utils");
const keygen = require("./keygen");
const adminCommands = require("./admin");

const bot = new Telegraf(BOT_TOKEN);

// Подключаем админ-команды
adminCommands(bot);

// START
bot.start((ctx) => {
    const u = ctx.from;

    const exists = db.prepare("SELECT * FROM users WHERE id = ?").get(u.id);
    if (!exists) {
        db.prepare(`
            INSERT INTO users (id, username, created_at)
            VALUES (?, ?, datetime('now'))
        `).run(u.id, u.username);
    }

    ctx.reply("Добро пожаловать в AstraGuardVPN!\n\nМеню:\n• Пробный доступ\n• Купить VPN\n• Мои VPN\n• Поддержка");
});

// Пробный доступ
bot.hears("Пробный доступ", async (ctx) => {
    const url = await keygen.giveTrial(ctx.from.id);
    if (!url) return ctx.reply("Ты уже использовал пробный доступ.");

    ctx.reply(`Твой пробный VPN:\n${url}`);
});

// Купить VPN
bot.hears("Купить VPN", async (ctx) => {
    const url = await keygen.givePaid(ctx.from.id);
    ctx.reply(`Твой VPN на 30 дней:\n${url}`);
});

// Мои VPN
bot.hears("Мои VPN", (ctx) => {
    const rows = db.prepare("SELECT * FROM keys WHERE user_id = ?").all(ctx.from.id);

    if (!rows.length) return ctx.reply("У тебя нет активных VPN.");

    let msg = "Твои VPN:\n\n";
    rows.forEach(k => {
        msg += `• ${k.sub_url}\nдо: ${k.expires_at}\n\n`;
    });

    ctx.reply(msg);
});

// Поддержка
bot.hears("Поддержка", (ctx) => {
    ctx.reply("Напиши сообщение, и админ ответит.");
});

// Сообщения в поддержку
bot.on("text", (ctx) => {
    const text = ctx.message.text;

    if (["Пробный доступ", "Купить VPN", "Мои VPN", "Поддержка"].includes(text)) return;

    db.prepare(`
        INSERT INTO tickets (user_id, message, from_admin, created_at)
        VALUES (?, ?, 0, datetime('now'))
    `).run(ctx.from.id, text);

    ADMINS.forEach(a => {
        bot.telegram.sendMessage(a, `Новое сообщение от ${ctx.from.id}:\n${text}`);
    });

    ctx.reply("Сообщение отправлено в поддержку.");
});

// Ответ админа
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

        bot.telegram.sendMessage(userId, `Ответ поддержки:\n${text}`);
    }
});

bot.launch();
console.log("Бот запущен!");