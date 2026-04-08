const db = require("./db");
const { isAdmin } = require("./utils");
const { ADMINS } = require("./config");
const promo = require("./promo");
const keygen = require("./keygen");

module.exports = function (bot) {

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

    // --- ПРОМИКИ ---

    bot.command("addpromo", (ctx) => {
        if (!isAdmin(ctx.from.id, ADMINS)) return;

        const parts = ctx.message.text.split(" ");
        const name = parts[1];
        const discount = Number(parts[2]);
        const limit = Number(parts[3]);

        if (!name || isNaN(discount) || isNaN(limit)) {
            return ctx.reply("Используй: /addpromo NAME DISCOUNT% LIMIT");
        }

        try {
            promo.createPromo(name, discount, limit);
            ctx.reply(`Промокод ${name} создан. Скидка: ${discount}%, лимит: ${limit}`);
        } catch (e) {
            ctx.reply("Ошибка при создании промокода (возможно, уже существует).");
        }
    });

    bot.command("delpromo", (ctx) => {
        if (!isAdmin(ctx.from.id, ADMINS)) return;

        const name = ctx.message.text.split(" ")[1];
        if (!name) return ctx.reply("Используй: /delpromo NAME");

        promo.deletePromo(name);
        ctx.reply(`Промокод ${name} удалён.`);
    });

    bot.command("promo", (ctx) => {
        if (!isAdmin(ctx.from.id, ADMINS)) return;

        const promos = promo.getAllPromos();
        if (!promos.length) return ctx.reply("Промокодов нет.");

        let msg = "🎟 Промокоды:\n\n";
        promos.forEach(p => {
            msg += `• ${p.name} — скидка ${p.discount}%, использовано ${p.used}/${p.usage_limit}\n`;
        });

        ctx.reply(msg);
    });

    // --- /vpnkey DAYS DEVICES ---

    bot.command("vpnkey", async (ctx) => {
        if (!isAdmin(ctx.from.id, ADMINS)) return;

        const parts = ctx.message.text.split(" ");
        const days = Number(parts[1]) || 365;
        const devices = Number(parts[2]) || 1;

        // devices можно использовать в Hiddify, если будешь делать multi-user
        const url = await keygen.givePaid(ctx.from.id, days);

        ctx.reply(`🔑 Ключ на ${days} дней, устройств: ${devices}\n${url}`);
    });

    // бан/разбан/рассылка оставь как было, если нужно

    bot.command("refstats", (ctx) => {
        if (!isAdmin(ctx.from.id, ADMINS)) return;

        const rows = db.prepare(`
        SELECT user_id, COUNT(*) AS invited
        FROM referrals
        GROUP BY user_id
        ORDER BY invited DESC
    `).all();

        if (!rows.length) return ctx.reply("Реферальных данных нет.");

        let msg = "👥 *Реферальная статистика:*\n\n";

        rows.forEach(r => {
            msg += `• ${r.user_id}: пригласил ${r.invited}\n`;
        });

        ctx.reply(msg, { parse_mode: "Markdown" });
    });

};
