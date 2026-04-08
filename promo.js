const db = require("./db");

module.exports = {
    createPromo(name, discount, limit) {
        db.prepare(`
            INSERT INTO promocodes (name, discount, usage_limit)
            VALUES (?, ?, ?)
        `).run(name, discount, limit);
    },

    deletePromo(name) {
        db.prepare(`DELETE FROM promocodes WHERE name = ?`).run(name);
    },

    getAllPromos() {
        return db.prepare(`SELECT * FROM promocodes`).all();
    },

    getPromoByName(name) {
        return db.prepare(`SELECT * FROM promocodes WHERE name = ?`).get(name);
    },

    hasUserUsedPromo(userId, promoId) {
        const row = db.prepare(`
            SELECT * FROM promo_usage WHERE user_id = ? AND promo_id = ?
        `).get(userId, promoId);
        return !!row;
    },

    markPromoUsed(userId, promoId) {
        db.prepare(`
            INSERT INTO promo_usage (user_id, promo_id)
            VALUES (?, ?)
        `).run(userId, promoId);

        db.prepare(`
            UPDATE promocodes SET used = used + 1 WHERE id = ?
        `).run(promoId);
    },

    canUsePromo(promo) {
        if (!promo) return false;
        if (promo.usage_limit === null) return true;
        return promo.used < promo.usage_limit;
    }
};
