const yoomoney = require("./yoomoney");
const keygen = require("../vpn/keygen");

function attachPaymentAdminHandlers(bot) {
  bot.action(/ym_yes_(\d+)_(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const paymentId = Number(ctx.match[1]);
    const userId = Number(ctx.match[2]);

    const payment = yoomoney.getPaymentById(paymentId);
    if (!payment) return ctx.reply("Платёж не найден.");

    yoomoney.markPaid(paymentId);

    const url = await keygen.givePaid(userId, payment.days);
    await ctx.telegram.sendMessage(
      userId,
      `🎉 *Оплата подтверждена!*\n\n` +
      `Твой VPN:\n${url}`,
      { parse_mode: "Markdown" }
    );

    await ctx.editMessageText("✅ Оплата подтверждена.");
  });

  bot.action(/ym_no_(\d+)_(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("❌ Оплата отклонена.");
  });
}

module.exports = {
  attachPaymentAdminHandlers
};
