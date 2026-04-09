module.exports = {
  BOT_TOKEN: "ТОКЕН_БОТА",
  ADMINS: [123456789], // id админов
  YOOMONEY_WALLET: "4100XXXXXXXXXX",
  REF_BONUS_DAYS: 3,

  TARIFFS: [
    { days: 30, price: 100, label: "💸 30 дней — 100₽", callback: "buy_30" },
    { days: 90, price: 250, label: "💸 90 дней — 250₽", callback: "buy_90" },
    { days: 180, price: 450, label: "💸 180 дней — 450₽", callback: "buy_180" }
  ]
};
