const axios = require("axios");
const { HIDDIFY_API } = require("./config");

const api = axios.create({
    baseURL: `${HIDDIFY_API.BASE_URL}/api`,
    headers: {
        "Authorization": `Bearer ${HIDDIFY_API.ADMIN_TOKEN}`,
        "Content-Type": "application/json"
    }
});

module.exports = {
    async createKey(days = 30) {
        const res = await api.post("/users", {
            expire_days: days
        });
        return res.data;
    },

    async createTrial(hours = 24) {
        const res = await api.post("/users", {
            expire_hours: hours
        });
        return res.data;
    },

    async getUserConfig(userId) {
        const res = await api.get(`/users/${userId}`);
        return res.data;
    }
};
