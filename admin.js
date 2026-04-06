// ===============================
// /addpromoAstraGuardVPN_bot NAME DISCOUNT USES
// ===============================
bot.command("addpromoAstraGuardVPN_bot", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const args = ctx.message.text.split(" ");

  // /addpromoAstraGuardVPN_bot CODE DISCOUNT USES
  if (args.length < 4) {
    return ctx.reply("Использование:\n/addpromoAstraGuardVPN_bot CODE СКИДКА% КОЛ-ВО_ИСПОЛЬЗОВАНИЙ");
  }

  const code = args[1].toUpperCase();
  const discount = parseInt(args[2]);
  const uses = parseInt(args[3]);

  if (isNaN(discount) || isNaN(uses)) {
    return ctx.reply("Ошибка: скидка и количество должны быть числами.");
  }

  const { PROMOCODES } = require("./config");

  // Добавляем промокод в массив
  PROMOCODES.push({
    code,
    discount,
    usesLeft: uses,
  });

  ctx.reply(
    `🎉 Промокод создан!\n\n` +
    `Код: ${code}\n` +
    `Скидка: ${discount}%\n` +
    `Использований: ${uses}`
  );
});
