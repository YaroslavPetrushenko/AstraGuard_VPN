const { ADMINS, YOOMONEY_WALLET } = require("../../config");
const { Markup } = require("telegraf");
const yoomoney = require("./yoomoney");
const db = require("../db");

function attachCheckHandler(bot, mainMenu) {
  bot.on("message", async (ctx, next) => {
    // если админ — дальше обработает admin-логика
    if (ADMINS.includes(ctx.from.id)) return next();

    const hasFile = ctx.message.photo || ctx.message.document;
    if (!hasFile) return next();

    const userId = ctx.from.id;
    const payment = yoomoney.getLastPendingPayment(userId);

    if (!payment) {
      return ctx.reply("У тебя нет ожидающих оплат.", mainMenu());
    }

    ADMINS.forEach(a => {
      bot.telegram.sendMessage(
        a,
        `💰 *Проверка платежа*\n\n` +
        `Пользователь: \`${userId}\`\n` +
        `Сумма: *${payment.amount}₽*\n` +
        `Код: \`${payment.code}\`\n\n` +
        `Кошелёк: \`${YOOMONEY_WALLET}\`\n\n` +
        `Подтвердить оплату?`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Да", callback_data: `ym_yes_${payment.id}_${userId}` }],
              [{ text: "❌ Нет", callback_data: `ym_no_${payment.id}_${userId}` }]
            ]
          }
        }
      );
    });

    return ctx.reply("Чек отправлен на проверку администратору.");
  });
}

module.exports = {
  attachCheckHandler
};
