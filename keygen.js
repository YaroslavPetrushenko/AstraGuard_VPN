const db = require("./db");
const hiddify = require("./hiddify");
const { TRIAL_HOURS } = require("./config");

module.exports = {
    async giveTrial(userId) {
        const exists = db.prepare("SELECT * FROM keys WHERE user_id = ? AND is_trial = 1").get(userId);
        if (exists) return null;

        const key = await hiddify.trial(TRIAL_HOURS);

        db.prepare(`
            INSERT INTO keys (user_id, hiddify_id, sub_url, expires_at, is_trial)
            VALUES (?, ?, ?, ?, 1)
        `).run(userId, key.uuid, key.subscription_url, key.expire_at);

        return key.subscription_url;
    },

    async givePaid(userId, days = 30) {

        // --- ДОБАВЛЯЕМ БОНУСНЫЕ ДНИ ---
        const bonus = db.prepare(`
            SELECT SUM(days) AS d FROM ref_bonus WHERE user_id = ?
        `).get(userId).d || 0;

        days += bonus;

        // очищаем бонусы после использования
        db.prepare(`DELETE FROM ref_bonus WHERE user_id = ?`).run(userId);

        // --- СОЗДАЁМ КЛЮЧ ---
        const key = await hiddify.create(days);

        db.prepare(`
            INSERT INTO keys (user_id, hiddify_id, sub_url, expires_at, is_trial)
            VALUES (?, ?, ?, ?, 0)
        `).run(userId, key.uuid, key.subscription_url, key.expire_at);

        return key.subscription_url;
    }
};
