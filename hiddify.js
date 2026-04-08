const axios = require("axios");
const { HIDDIFY } = require("./config");

const api = axios.create({
    baseURL: `${HIDDIFY.BASE_URL}/api`,
    headers: {
        "Authorization": `Bearer ${HIDDIFY.TOKEN}`,
        "Content-Type": "application/json"
    }
});

module.exports = {
    async create(days = 30) {
        const r = await api.post("/users", { expire_days: days });
        return r.data;
    },

    async trial(hours = 24) {
        const r = await api.post("/users", { expire_hours: hours });
        return r.data;
    },

    async get(id) {
        const r = await api.get(`/users/${id}`);
        return r.data;
    }
};
