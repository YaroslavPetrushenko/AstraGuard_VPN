const { ADMIN_ID } = require("./config");

module.exports = function registerSupport(bot) {
  // Кнопка "Поддержка"
  bot.hears("💬 Поддержка", (ctx) => {
    ctx.reply(
      "💬 *Техподдержка*\n\n" +
      "Напиши свой вопрос одним сообщением — оно будет отправлено администратору.\n" +
      "Ответ придёт сюда же.",
      { parse_mode: "Markdown" }
    );
  });

  // Перехват всех сообщений пользователя → отправка админу
  bot.on("text", async (ctx, next) => {
    const text = ctx.message.text;

    // системные кнопки — пропускаем
    const skip = [
      "🚀 Мой VPN",
      "💳 Купить подписку",
      "🆓 Пробный доступ",
      "👥 Реферальная программа",
      "📱 Как подключиться?",
      "ℹ️ О сервисе",
      "💬 Поддержка"
    ];

    if (skip.includes(text)) return next();

    // если пишет админ — пропускаем
    if (ctx.from.id === ADMIN_ID) return next();

    // отправляем админу
    await ctx.telegram.sendMessage(
      ADMIN_ID,
      `📩 *Новое сообщение в поддержку*\n\n` +
      `От: ${ctx.from.first_name} (ID: ${ctx.from.id})\n\n` +
      `Сообщение:\n${text}`,
      { parse_mode: "Markdown" }
    );

    ctx.reply("📨 Сообщение отправлено! Ожидай ответа.");
  });

  // Ответ админа пользователю
  bot.command("reply", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const args = ctx.message.text.split(" ");
    if (args.length < 3) {
      return ctx.reply("Использование: /reply USER_ID текст ответа");
    }

    const userId = args[1];
    const text = args.slice(2).join(" ");

    try {
      await ctx.telegram.sendMessage(
        userId,
        `📩 *Ответ от техподдержки:*\n\n${text}`,
        { parse_mode: "Markdown" }
      );
      ctx.reply("Ответ отправлен пользователю.");
    } catch {
      ctx.reply("Ошибка: пользователь недоступен.");
    }
  });
};
