const { Telegraf } = require("telegraf");
const db = require("./db");
const { BOT_TOKEN, ADMINS, TRIAL_HOURS } = require("./config");
const hiddify = require("./hiddify");

const bot = new Telegraf(BOT_TOKEN);

// Регистрация пользователя
bot.start(async (ctx) => {
    const user = ctx.from;
    const ref = ctx.startPayload ? Number(ctx.startPayload) : null;

    db.get("SELECT * FROM users WHERE id = ?", [user.id], (err, row) => {
        if (!row) {
            db.run(
                "INSERT INTO users (id, username, referrer, created_at) VALUES (?, ?, ?, datetime('now'))",
                [user.id, user.username, ref]
            );

            if (ref) {
                db.run(
                    "INSERT INTO referrals (user_id, invited_id) VALUES (?, ?)",
                    [ref, user.id]
                );
            }
        }
    });

    ctx.reply("Добро пожаловать в AstraGuardVPN!\n\nМеню:\n• Пробный доступ\n• Купить VPN\n• Мои VPN\n• Поддержка");
});

// Пробный доступ
bot.hears("Пробный доступ", async (ctx) => {
    const userId = ctx.from.id;

    db.get("SELECT * FROM keys WHERE user_id = ? AND is_trial = 1", [userId], async (err, row) => {
        if (row) return ctx.reply("Ты уже использовал пробный доступ.");

        const trial = await hiddify.createTrial(TRIAL_HOURS);

        db.run(
            "INSERT INTO keys (user_id, key, expires_at, is_trial) VALUES (?, ?, ?, 1)",
            [userId, trial.uuid, trial.expire_at]
        );

        ctx.reply(`Твой пробный VPN:\n\n${trial.subscription_url}`);
    });
});

// Купить VPN (упрощённо)
bot.hears("Купить VPN", async (ctx) => {
    const key = await hiddify.createKey(30);

    db.run(
        "INSERT INTO keys (user_id, key, expires_at, is_trial) VALUES (?, ?, ?, 0)",
        [ctx.from.id, key.uuid, key.expire_at]
    );

    ctx.reply(`Твой VPN на 30 дней:\n\n${key.subscription_url}`);
});

// Мои VPN
bot.hears("Мои VPN", (ctx) => {
    db.all("SELECT * FROM keys WHERE user_id = ?", [ctx.from.id], (err, rows) => {
        if (!rows.length) return ctx.reply("У тебя нет активных VPN.");

        let msg = "Твои VPN:\n\n";
        rows.forEach(k => {
            msg += `• ${k.key}\nдо: ${k.expires_at}\n\n`;
        });

        ctx.reply(msg);
    });
});

// Поддержка
bot.hears("Поддержка", (ctx) => {
    ctx.reply("Напиши своё сообщение, и админ ответит.");
});

// Приём сообщений в поддержку
bot.on("text", (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (["Пробный доступ", "Купить VPN", "Мои VPN", "Поддержка"].includes(text)) return;

    db.run(
        "INSERT INTO tickets (user_id, message, from_admin, created_at) VALUES (?, ?, 0, datetime('now'))",
        [userId, text]
    );

    ADMINS.forEach(admin => {
        bot.telegram.sendMessage(admin, `Новое сообщение от ${userId}:\n${text}`);
    });

    ctx.reply("Сообщение отправлено в поддержку.");
});

// Ответ админа
bot.on("message", (ctx) => {
    if (!ADMINS.includes(ctx.from.id)) return;

    if (ctx.reply_to_message) {
        const text = ctx.message.text;
        const original = ctx.reply_to_message.text.match(/(\d+)/);

        if (!original) return;

        const userId = Number(original[1]);

        db.run(
            "INSERT INTO tickets (user_id, message, from_admin, created_at) VALUES (?, ?, 1, datetime('now'))",
            [userId, text]
        );

        bot.telegram.sendMessage(userId, `Ответ поддержки:\n${text}`);
    }
});

bot.launch();
