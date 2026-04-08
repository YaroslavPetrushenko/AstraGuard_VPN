const db = require("./db");
const { isAdmin } = require("./utils");
const { ADMINS } = require("./config");

module.exports = function(bot) {

    bot.command("users", (ctx) => {
        if (!isAdmin(ctx.from.id, ADMINS)) return;

        const count = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
        ctx.reply(`Пользователей: ${count}`);
    });

    bot.command("keys", (ctx) => {
        if (!isAdmin(ctx.from.id, ADMINS)) return;

        const count = db.prepare("SELECT COUNT(*) AS c FROM keys").get().c;
        ctx.reply(`Выдано ключей: ${count}`);
    });

    bot.command("stats", (ctx) => {
        if (!isAdmin(ctx.from.id, ADMINS)) return;

        const users = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
        const keys = db.prepare("SELECT COUNT(*) AS c FROM keys").get().c;

        ctx.reply(`📊 Статистика:\nПользователи: ${users}\nКлючи: ${keys}`);
    });

    bot.command("ban", (ctx) => {
        if (!isAdmin(ctx.from.id, ADMINS)) return;

        const id = Number(ctx.message.text.split(" ")[1]);
        if (!id) return ctx.reply("Используй: /ban <id>");

        db.prepare("UPDATE users SET banned = 1 WHERE id = ?").run(id);
        ctx.reply(`Пользователь ${id} забанен.`);
    });

    bot.command("unban", (ctx) => {
        if (!isAdmin(ctx.from.id, ADMINS)) return;

        const id = Number(ctx.message.text.split(" ")[1]);
        if (!id) return ctx.reply("Используй: /unban <id>");

        db.prepare("UPDATE users SET banned = 0 WHERE id = ?").run(id);
        ctx.reply(`Пользователь ${id} разбанен.`);
    });

    bot.command("broadcast", (ctx) => {
        if (!isAdmin(ctx.from.id, ADMINS)) return;

        const text = ctx.message.text.replace("/broadcast ", "");
        if (!text) return ctx.reply("Используй: /broadcast <текст>");

        const users = db.prepare("SELECT id FROM users").all();

        users.forEach(u => {
            bot.telegram.sendMessage(u.id, `📢 Рассылка:\n${text}`);
        });

        ctx.reply("Рассылка отправлена.");
    });
};
