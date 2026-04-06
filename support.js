const { ADMIN_ID } = require("./config");

module.exports = function registerSupport(bot) {
  const supportState = new Map();

  // Кнопка "Поддержка"
  bot.hears("💬 Поддержка", (ctx) => {
    supportState.set(ctx.from.id, true);
    ctx.reply("Напишите ваш вопрос одним сообщением. Техподдержка ответит вам в ближайшее время.");
  });

  // Перехват текста для поддержки
  bot.on("text", async (ctx, next) => {
    const text = ctx.message.text;

    // системные кнопки — пропускаем
    const buttons = [
      "🚀 Мой VPN",
      "💳 Купить подписку",
      "🆓 Пробный доступ",
      "👥 Реферальная программа",
      "📱 Как подключиться?",
      "ℹ️ О сервисе",
      "💬 Поддержка",
    ];
    if (buttons.includes(text)) return next();

    // если это админ — пропускаем
    if (ctx.from.id === ADMIN_ID) return next();

    // если пользователь не в режиме поддержки — пропускаем
    if (!supportState.get(ctx.from.id)) return next();

    await ctx.telegram.sendMessage(
      ADMIN_ID,
      `🆘 *Новый вопрос в поддержку*\n\n` +
      `От: ${ctx.from.first_name} (@${ctx.from.username || "нет"})\n` +
      `ID: ${ctx.from.id}\n\n` +
      `Вопрос:\n${text}`,
      { parse_mode: "Markdown" }
    );

    ctx.reply("Ваш вопрос отправлен. Ожидайте ответа от техподдержки.");

    supportState.delete(ctx.from.id);
  });

  // Ответ админа
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
