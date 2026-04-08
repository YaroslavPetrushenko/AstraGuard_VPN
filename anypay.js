const crypto = require("crypto");
const db = require("./db");
const { ANYPAY } = require("./config");

// --- Генерация подписи ---
function makeSign({ merchant_id, pay_id, amount, currency, secret }) {
    const str = `${merchant_id}${pay_id}${amount}${currency}${secret}`;
    return crypto.createHash("md5").update(str).digest("hex");
}

// --- Создание ссылки на оплату ---
function createInvoice(userId, amount, promoId = null) {
    const currency = "RUB";

    // invoice_id = уникальный ID платежа
    const invoice_id = `${userId}_${Date.now()}`;

    const sign = makeSign({
        merchant_id: ANYPAY.PROJECT_ID,
        pay_id: invoice_id,
        amount,
        currency,
        secret: ANYPAY.SECRET_KEY
    });

    const url =
        `https://anypay.io/merchant?merchant_id=${ANYPAY.PROJECT_ID}` +
        `&pay_id=${invoice_id}` +
        `&amount=${amount}` +
        `&currency=${currency}` +
        `&sign=${sign}`;

    // сохраняем в БД
    db.prepare(`
        CREATE TABLE IF NOT EXISTS payments (
            invoice_id TEXT PRIMARY KEY,
            user_id INTEGER,
            amount INTEGER,
            promo_id INTEGER,
            paid INTEGER DEFAULT 0,
            created_at TEXT
        )
    `).run();

    db.prepare(`
        INSERT INTO payments (invoice_id, user_id, amount, promo_id, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
    `).run(invoice_id, userId, amount, promoId);

    return { invoice_id, url };
}

// --- Получить платёж ---
function getPaymentByInvoice(invoice_id) {
    return db.prepare(`SELECT * FROM payments WHERE invoice_id = ?`).get(invoice_id);
}

// --- Пометить как оплаченный ---
function markPaid(invoice_id) {
    db.prepare(`UPDATE payments SET paid = 1 WHERE invoice_id = ?`).run(invoice_id);
}

module.exports = {
    createInvoice,
    getPaymentByInvoice,
    markPaid
};
