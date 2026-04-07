const axios = require("axios");
const { pool } = require("./db");
const { ANYPAY_API_KEY, ANYPAY_SHOP_ID } = require("./config");

/**
 * Создать платёж в AnyPay и записать его в БД
 * @param {number} userId  — Telegram ID пользователя
 * @param {number} days    — срок подписки
 * @param {number} amount  — сумма в рублях
 * @returns {Promise<{id: string, pay_url: string}>}
 */
async function createPayment(userId, days, amount) {
  // запрос в AnyPay
  const res = await axios.post(
    "https://anypay.io/api/v2/create-payment",
    {
      shop_id: ANYPAY_SHOP_ID,
      amount: amount,
      currency: "RUB",
      description: `AstraGuardVPN — ${days} дней`,
      custom: String(userId),
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": ANYPAY_API_KEY,
      },
      timeout: 10000,
    }
  );

  if (!res.data || !res.data.data) {
    throw new Error("Некорректный ответ AnyPay при создании платежа");
  }

  const pay = res.data.data;

  // сохраняем платёж в БД
  await pool.query(
    `
    INSERT INTO payments (user_id, days, amount, pay_id, pay_url, status, created_at)
    VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
    `,
    [userId, days, amount, pay.id, pay.pay_url]
  );

  return {
    id: pay.id,
    pay_url: pay.pay_url,
  };
}

/**
 * Проверить статус платежа в AnyPay
 * @param {string} payId — ID платежа в AnyPay
 * @returns {Promise<"pending"|"paid"|"canceled"|"error">}
 */
async function getRemotePaymentStatus(payId) {
  const res = await axios.get(
    `https://anypay.io/api/v2/payment-status?payment_id=${encodeURIComponent(
      payId
    )}`,
    {
      headers: {
        "X-Api-Key": ANYPAY_API_KEY,
      },
      timeout: 10000,
    }
  );

  if (!res.data || !res.data.data) {
    return "error";
  }

  const status = res.data.data.status;

  if (status === "paid") return "paid";
  if (status === "canceled") return "canceled";
  return "pending";
}

/**
 * Получить все незавершённые платежи из БД
 */
async function getPendingPayments(limit = 50) {
  const res = await pool.query(
    `
    SELECT id, user_id, days, amount, pay_id, pay_url, status
    FROM payments
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT $1
    `,
    [limit]
  );
  return res.rows;
}

/**
 * Обновить статус платежа в БД
 */
async function updatePaymentStatus(id, status) {
  await pool.query(
    `
    UPDATE payments
    SET status = $2
    WHERE id = $1
    `,
    [id, status]
  );
}

/**
 * Получить платёж по ID
 */
async function getPaymentById(id) {
  const res = await pool.query(
    `
    SELECT *
    FROM payments
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );
  return res.rows[0] || null;
}

/**
 * Получить платёж по pay_id (AnyPay)
 */
async function getPaymentByPayId(payId) {
  const res = await pool.query(
    `
    SELECT *
    FROM payments
    WHERE pay_id = $1
    LIMIT 1
    `,
    [payId]
  );
  return res.rows[0] || null;
}

module.exports = {
  createPayment,
  getRemotePaymentStatus,
  getPendingPayments,
  updatePaymentStatus,
  getPaymentById,
  getPaymentByPayId,
};
