const { ADMIN_ID } = require("./config");

module.exports = function registerAdminCommands(bot) {

  bot.command("sendto", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const args = ctx.message.text.split(" ");
    if (args.length < 3) return ctx.reply("Использование: /sendto USER_ID текст");

    const userId = args[1];
    const text = args.slice(2).join(" ");

    await bot.telegram.sendMessage(userId, text);
    ctx.reply("Отправлено.");
  });

  bot.command("reply", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const args = ctx.message.text.split(" ");
    if (args.length < 3) return ctx.reply("Использование: /reply USER_ID текст");

    const userId = args[1];
    const text = args.slice(2).join(" ");

    await bot.telegram.sendMessage(
      userId,
      `📩 Ответ поддержки:\n${text}`
    );

    ctx.reply("Ответ отправлен.");
  });
};
