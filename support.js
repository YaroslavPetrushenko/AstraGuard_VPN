const { ADMIN_ID } = require("./config");

module.exports = function registerSupport(bot) {
  const state = new Map();

  bot.hears("💬 Поддержка", (ctx) => {
    ctx.reply("Напиши свой вопрос одним сообщением.");
    state.set(ctx.from.id, true);
  });

  bot.on("text", async (ctx, next) => {
    if (!state.get(ctx.from.id)) return next();

    await bot.telegram.sendMessage(
      ADMIN_ID,
      `🆘 Вопрос от ${ctx.from.id}:\n${ctx.message.text}`
    );

    ctx.reply("Ваш вопрос отправлен. Ожидайте ответа.");
    state.delete(ctx.from.id);
  });
};
