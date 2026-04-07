const { pool } = require("./db");
const { ANYPAY_API_KEY, ANYPAY_SHOP_ID } = require("./config");

// Предполагаем Node 18+ с глобальным fetch
const ANYPAY_API_URL = "https://anypay.io/api/v1";

// Создание платежа
async function createPayment(userId, days, amount) {
  // Создаём запись в БД
  const dbRes = await pool.query(
    `
    INSERT INTO payments (user_id, days, amount, status)
    VALUES ($1, $2, $3, 'pending')
    RETURNING *;
    `,
    [userId, days, amount]
  );

  const payment = dbRes.rows[0];

  // Создаём платёж в AnyPay
  const payload = {
    shop_id: ANYPAY_SHOP_ID,
    amount: amount,
    currency: "RUB",
    order_id: String(payment.id),
    desc: `AstraGuardVPN: ${days} дней`,
  };

  const res = await fetch(`${ANYPAY_API_URL}/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": ANYPAY_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("AnyPay create invoice error:", res.status, await res.text());
    throw new Error("AnyPay create invoice failed");
  }

  const data = await res.json();

  const payId = data.id || data.invoice_id || null;
  const payUrl = data.link || data.url || null;

  await pool.query(
    `
    UPDATE payments
    SET pay_id = $2,
        pay_url = $3
    WHERE id = $1;
    `,
    [payment.id, payId, payUrl]
  );

  return {
    id: payment.id,
    user_id: payment.user_id,
    days: payment.days,
    amount: payment.amount,
    pay_id: payId,
    pay_url: payUrl,
  };
}

// Получение статуса платежа
async function getRemotePaymentStatus(payId) {
  if (!payId) return "error";

  const res = await fetch(`${ANYPAY_API_URL}/invoice/${encodeURIComponent(payId)}`, {
    method: "GET",
    headers: {
      "X-Api-Key": ANYPAY_API_KEY,
    },
  });

  if (!res.ok) {
    console.error("AnyPay get invoice error:", res.status, await res.text());
    return "error";
  }

  const data = await res.json();

  const status = (data.status || "").toLowerCase();

  if (status === "paid" || status === "success") return "paid";
  if (status === "canceled" || status === "cancelled" || status === "failed") return "canceled";
  if (status === "pending" || status === "wait") return "pending";

  return "error";
}

// Неподтверждённые платежи
async function getPendingPayments(limit = 50) {
  const res = await pool.query(
    `
    SELECT *
    FROM payments
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT $1;
    `,
    [limit]
  );
  return res.rows;
}

async function updatePaymentStatus(id, status) {
  await pool.query(
    `
    UPDATE payments
    SET status = $2
    WHERE id = $1;
    `,
    [id, status]
  );
}

module.exports = {
  createPayment,
  getRemotePaymentStatus,
  getPendingPayments,
  updatePaymentStatus,
};
