require("dotenv").config();

module.exports = {
  // Клиентский бот
  BOT_TOKEN: process.env.BOT_TOKEN,

  // Админ-бот
  ADMIN_BOT_TOKEN: process.env.ADMIN_BOT_TOKEN,

  // Webhook'и
  WEBHOOK_URL_CLIENT: process.env.WEBHOOK_URL_CLIENT,
  WEBHOOK_URL_ADMIN: process.env.WEBHOOK_URL_ADMIN,

  // Общие
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL,

  // AnyPay
  ANYPAY_API_KEY: process.env.ANYPAY_API_KEY,
  ANYPAY_SHOP_ID: process.env.ANYPAY_SHOP_ID,

  // Админы (через запятую в .env)
  ADMIN_IDS: process.env.ADMIN_IDS
    ? process.env.ADMIN_IDS.split(",").map((id) => Number(id.trim()))
    : [],

  // Опционально: URL админ-сервиса (если хочешь HTTP-связку)
  ADMIN_BOT_URL: process.env.ADMIN_BOT_URL || null,
};
