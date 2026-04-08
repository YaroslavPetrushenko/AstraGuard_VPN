module.exports = {
    isAdmin(id, ADMINS) {
        return ADMINS.includes(id);
    },

    formatDate(date) {
        return new Date(date).toLocaleString("ru-RU");
    }
};
