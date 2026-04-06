const { ADMIN_ID } = require("./config");
const { getAllUsers } = require("./users");

module.exports = function registerBroadcast(bot) {
  bot.command("broadcast", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const text = ctx.message.text.replace("/broadcast", "").trim();
    if (!text) return ctx.reply("Напиши текст рассылки.");

    const users = await getAllUsers();
    let ok = 0, fail = 0;

    for (const u of users) {
      try {
        await bot.telegram.sendMessage(u.userId, text);
        ok++;
      } catch {
        fail++;
      }
    }

    ctx.reply(`Рассылка завершена.\nУспешно: ${ok}\nОшибок: ${fail}`);
  });

  // фото-рассылка через /photocast в подписи
  bot.on("photo", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const caption = ctx.message.caption || "";
    if (!caption.startsWith("/photocast")) return;

    const text = caption.replace("/photocast", "").trim();
    const photoId = ctx.message.photo.pop().file_id;

    const users = await getAllUsers();
    let ok = 0, fail = 0;

    for (const u of users) {
      try {
        await bot.telegram.sendPhoto(u.userId, photoId, { caption: text });
        ok++;
      } catch {
        fail++;
      }
    }

    ctx.reply(`Фото‑рассылка завершена.\nУспешно: ${ok}\nОшибок: ${fail}`);
  });
};
