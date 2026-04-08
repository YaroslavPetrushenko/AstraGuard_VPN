module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,

    ADMINS: [
        6784875182, // ты
        // 8398980713, // Ната, если нужно
    ],

    HIDDIFY: {
        BASE_URL: process.env.HIDDIFY_URL,
        TOKEN: process.env.HIDDIFY_TOKEN
    },

    ANYPAY: {
        PROJECT_ID: 17515,                 // ID проекта (магазина)
        API_ID: "6UQFFQBVEOTVG5ZO8U",      // API ID
        API_KEY: "qKvwffyyEGEkGqf6yPptQy4zY4LdFKL26M0rAvE",  // В КОД НЕ ПИШИ, ВЫНЕСИ В ENV
        SECRET_KEY: "pMnlv09jPKvI6sXIZtOc7uDVPAJTqpsaVNYJWcn" // В КОД НЕ ПИШИ, ВЫНЕСИ В ENV
    },

    TRIAL_HOURS: 24,
    VPN_PRICE_BASE: 100,      // базовая цена за 30 дней
    REF_BONUS_DAYS: 3
};
