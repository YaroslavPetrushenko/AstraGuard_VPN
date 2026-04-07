require("dotenv").config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  DATABASE_URL: process.env.DATABASE_URL,
  ANYPAY_API_KEY: process.env.ANYPAY_API_KEY,
  ANYPAY_SHOP_ID: process.env.ANYPAY_SHOP_ID,
};
