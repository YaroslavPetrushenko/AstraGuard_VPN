const crypto = require("crypto");
const axios = require("axios");
const db = require("./db");
const { ANYPAY } = require("./config");

function createSign(params) {
    // ВАЖНО: формулу подписи возьми из доки AnyPay v3.
    // Здесь просто каркас:
    const str = `${ANYPAY.PROJECT_ID}:${params.amount}:${ANYPAY.API_KEY}:${params.pay_id}`;
    return crypto.createHash("sha256").update(str).digest("hex");
}

module.exports = {
    async createInvoice(userId, amount, promoId = null) {
        const pay_id = `${userId}_${Date.now()}`;

        const sign = createSign({ amount, pay_id });

        // URL и поля уточни по доке AnyPay
        const payload = {
            project_id: ANYPAY.PROJECT_ID,
            api_id: ANYPAY.API_ID,
            pay_id,
            amount,
            currency: "RUB",
            desc: "Оплата VPN",
            sign
        };

        // Пример: const res = await axios.post("https://anypay.io/api/v3/invoice/create", payload);
        // const invoice = res.data;

        // Пока без реального запроса — просто формируем ссылку:
        const fakeInvoiceId = pay_id;
        const paymentUrl = `https://anypay.io/merchant?merchant_id=${ANYPAY.PROJECT_ID}&pay_id=${pay_id}&amount=${amount}`;

        db.prepare(`
            INSERT INTO payments (user_id, amount, promo_id, status, anypay_invoice_id, created_at)
            VALUES (?, ?, ?, 'pending', ?, datetime('now'))
        `).run(userId, amount, promoId, fakeInvoiceId);

        return {
            url: paymentUrl,
            invoice_id: fakeInvoiceId
        };
    },

    async markPaid(invoiceId) {
        db.prepare(`
            UPDATE payments SET status = 'paid' WHERE anypay_invoice_id = ?
        `).run(invoiceId);
    },

    getPaymentByInvoice(invoiceId) {
        return db.prepare(`
            SELECT * FROM payments WHERE anypay_invoice_id = ?
        `).get(invoiceId);
    }
};
