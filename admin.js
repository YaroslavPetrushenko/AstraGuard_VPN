const { ADMIN_ID, PROMOCODES } = require("./config");

module.exports = function registerAdminCommands(bot) {

  // ===============================
  // /sendto USER_ID текст
  // ===============================
  bot.command("sendto", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const args = ctx.message.text.split(" ");
    if (args.length < 3) return ctx.reply("Использование: /sendto USER_ID текст");

    const userId = args[1];
    const text = args.slice(2).join(" ");

    await bot.telegram.sendMessage(userId, text);
    ctx.reply("Отправлено.");
  });

  // ===============================
  // /reply USER_ID текст
  // ===============================
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

  // ===============================
  // /addpromoAstraGuardVPN_bot CODE DISCOUNT USES
  // ===============================
  bot.command("addpromoAstraGuardVPN_bot", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const args = ctx.message.text.split(" ");

    if (args.length < 4) {
      return ctx.reply("Использование:\n/addpromoAstraGuardVPN_bot CODE СКИДКА% КОЛ-ВО");
    }

    const code = args[1].toUpperCase();
    const discount = parseInt(args[2]);
    const uses = parseInt(args[3]);

    if (isNaN(discount) || isNaN(uses)) {
      return ctx.reply("Ошибка: скидка и количество должны быть числами.");
    }

    PROMOCODES.push({
      code,
      discount,
      usesLeft: uses,
    });

    ctx.reply(
      `🎉 *Промокод успешно создан!*\n\n` +
      `🔑 *Код:* \`${code}\`\n` +
      `💸 *Скидка:* ${discount}%\n` +
      `♻️ *Использований доступно:* ${uses}\n\n` +
      `Промокод активен.`,
      { parse_mode: "Markdown" }
    );
  });

  // ===============================
  // /delpromoAstraGuardVPN_bot CODE
  // ===============================
  bot.command("delpromoAstraGuardVPN_bot", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const args = ctx.message.text.split(" ");
    if (args.length < 2) {
      return ctx.reply("Использование:\n/delpromoAstraGuardVPN_bot CODE");
    }

    const code = args[1].toUpperCase();

    const index = PROMOCODES.findIndex((p) => p.code === code);

    if (index === -1) {
      return ctx.reply(`❌ Промокод \`${code}\` не найден.`, { parse_mode: "Markdown" });
    }

    PROMOCODES.splice(index, 1);

    ctx.reply(
      `🗑 *Промокод удалён!*\n\n` +
      `🔑 *Код:* \`${code}\`\n` +
      `Промокод больше не доступен.`,
      { parse_mode: "Markdown" }
    );
  });

};
