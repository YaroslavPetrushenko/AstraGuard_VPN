const { Telegraf, Markup } = require("telegraf");
const db = require("./modules/db");
const keygen = require("./modules/vpn/keygen");
const promo = require("./modules/promo/promo");
const support = require("./modules/support/support"); // если не нужен – можешь потом выпилить
const { attachCheckHandler } = require("./modules/payments/checker");
const { attachPaymentAdminHandlers } = require("./modules/payments/admin");
const { BOT_TOKEN, ADMINS, REF_BONUS_DAYS, TARIFFS, YOOMONEY_WALLET } = require("./config");
const yoomoney = require("./modules/payments/yoomoney");

const bot = new Telegraf(BOT_TOKEN);

// ---------------- УТИЛИТЫ ----------------

function isAdmin(id) {
  return ADMINS.includes(id);
}

function nowSqlite() {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

// ---------------- МЕНЮ ----------------

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🎁 Пробный доступ", "trial")],
    [Markup.button.callback("💳 Купить VPN", "buy")],
    [Markup.button.callback("🔑 Мои VPN", "myvpn")],
    [Markup.button.callback("👥 Пригласить друга", "referral")],
    [Markup.button.callback("🛠 Поддержка", "support")]
  ]);
}

function buyMenu() {
  return Markup.inlineKeyboard([
    ...TARIFFS.map(t => [Markup.button.callback(t.label, t.callback)]),
    [Markup.button.callback("⬅ Назад", "back_main")]
  ]);
}

function supportMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✏ Написать сообщение", "support_write")],
    [Markup.button.callback("⬅ Назад", "back_main")]
  ]);
}

// ---------------- РАБОТА С ТИКЕТАМИ ----------------

// Получить активный тикет пользователя (open или taken)
function getActiveTicketByUser(userId) {
  return db.prepare(`
    SELECT * FROM tickets
    WHERE user_id = ? AND status IN ('open', 'taken')
    ORDER BY id DESC
    LIMIT 1
  `).get(userId);
}

// Получить тикет по id
function getTicketById(ticketId) {
  return db.prepare(`
    SELECT * FROM tickets
    WHERE id = ?
  `).get(ticketId);
}

// Создать новый тикет
function createTicket(userId) {
  const now = nowSqlite();
  const info = db.prepare(`
    INSERT INTO tickets (user_id, admin_id, status, created_at, updated_at)
    VALUES (?, NULL, 'open', ?, ?)
  `).run(userId, now, now);
  return getTicketById(info.lastInsertRowid);
}

// Добавить сообщение в историю тикета
function addTicketMessage(ticketId, sender, senderId, text) {
  const now = nowSqlite();
  db.prepare(`
    INSERT INTO ticket_messages (ticket_id, sender, sender_id, text, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(ticketId, sender, senderId, text, now);
}

// Получить все сообщения тикета
function getTicketMessages(ticketId) {
  return db.prepare(`
    SELECT * FROM ticket_messages
    WHERE ticket_id = ?
    ORDER BY id ASC
  `).all(ticketId);
}

// Обновить статус тикета и/или админа
function updateTicketStatus(ticketId, fields) {
  const ticket = getTicketById(ticketId);
  if (!ticket) return null;

  const now = nowSqlite();
  const newStatus = fields.status !== undefined ? fields.status : ticket.status;
  const newAdminId = fields.admin_id !== undefined ? fields.admin_id : ticket.admin_id;

  db.prepare(`
    UPDATE tickets
    SET status = ?, admin_id = ?, updated_at = ?
    WHERE id = ?
  `).run(newStatus, newAdminId, now, ticketId);

  return getTicketById(ticketId);
}

// Сохранить message_id карточки тикета для админа
function saveTicketAdminMessage(ticketId, adminId, messageId) {
  db.prepare(`
    INSERT INTO ticket_admin_messages (ticket_id, admin_id, message_id)
    VALUES (?, ?, ?)
  `).run(ticketId, adminId, messageId);
}

// Получить все карточки тикета у админов
function getTicketAdminMessages(ticketId) {
  return db.prepare(`
    SELECT * FROM ticket_admin_messages
    WHERE ticket_id = ?
  `).all(ticketId);
}

// Удалить все записи карточек тикета
function deleteTicketAdminMessages(ticketId) {
  db.prepare(`
    DELETE FROM ticket_admin_messages
    WHERE ticket_id = ?
  `).run(ticketId);
}

// Полностью удалить тикет и его историю
function deleteTicketCompletely(ticketId) {
  db.prepare(`DELETE FROM ticket_messages WHERE ticket_id = ?`).run(ticketId);
  deleteTicketAdminMessages(ticketId);
  db.prepare(`DELETE FROM tickets WHERE id = ?`).run(ticketId);
}

// Сформировать текст истории тикета
function buildTicketHistoryText(ticketId) {
  const messages = getTicketMessages(ticketId);
  if (!messages || messages.length === 0) {
    return "История: (пока пусто)";
  }

  let text = "История:\n";
  messages.forEach((m, idx) => {
    const prefix = m.sender === "user" ? "Пользователь" : "Админ";
    text += `${idx + 1}) [${prefix}] ${m.text}\n`;
  });

  return text.trim();
}

// Сформировать текст карточки тикета для админа
function buildTicketCardText(ticket, user, admin) {
  const statusText = ticket.status === "open"
    ? "свободен"
    : "занят";

  const adminLine = ticket.admin_id
    ? `Админ: ${admin ? ("@" + (admin.username || admin.id)) : ticket.admin_id}\n`
    : "";

  const historyText = buildTicketHistoryText(ticket.id);

  const header = ticket.status === "open" ? "🆕 Новый тикет" : "📨 Тикет";

  let text = `${header} #${ticket.id}\n`;
  text += `Пользователь: ${ticket.user_id}\n`;
  text += adminLine;
  text += `Статус: ${statusText}\n\n`;
  text += historyText;

  return text;
}

// Кнопки для карточки тикета у админа
function ticketAdminKeyboard(ticket, adminId) {
  const isTaken = ticket.status === "taken";
  const isOwner = ticket.admin_id === adminId;

  const buttons = [];

  if (!isTaken) {
    buttons.push([
      Markup.button.callback("✅ Взять тикет", `ticket_take_${ticket.id}`)
    ]);
  } else {
    if (isOwner) {
      buttons.push([
        Markup.button.callback("✉ Ответить", `ticket_reply_${ticket.id}`),
        Markup.button.callback("❌ Закрыть тикет", `ticket_close_${ticket.id}`)
      ]);
    } else {
      buttons.push([
        Markup.button.callback("⛔ Занят другим админом", `ticket_busy_${ticket.id}`)
      ]);
    }
  }

  return Markup.inlineKeyboard(buttons);
}

// Кнопки для пользователя в тикете
function ticketUserKeyboard(ticketId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("❌ Закрыть тикет", `ticket_user_close_${ticketId}`)]
  ]);
}

// Обновить карточки тикета у всех админов
async function refreshTicketCardsForAdmins(bot, ticket) {
  const adminMessages = getTicketAdminMessages(ticket.id);

  for (const am of adminMessages) {
    const adminId = am.admin_id;
    const messageId = am.message_id;

    const adminUser = { id: adminId }; // username мы не знаем, но это не критично
    const user = { id: ticket.user_id };

    const text = buildTicketCardText(ticket, user, adminUser);

    try {
      await bot.telegram.editMessageText(
        adminId,
        messageId,
        null,
        text,
        {
          parse_mode: "Markdown",
          ...ticketAdminKeyboard(ticket, adminId)
        }
      );
    } catch (e) {
      // если не получилось обновить (сообщение удалено и т.п.) — просто игнор
      console.error("Не удалось обновить карточку тикета у админа", adminId, e.message);
    }
  }
}

// Отправить новую карточку тикета всем админам
async function sendNewTicketCardsToAdmins(bot, ticket, firstMessageText) {
  const userId = ticket.user_id;

  for (const adminId of ADMINS) {
    const adminUser = { id: adminId };
    const user = { id: userId };

    const text = buildTicketCardText(ticket, user, adminUser);

    try {
      const msg = await bot.telegram.sendMessage(
        adminId,
        text,
        {
          parse_mode: "Markdown",
          ...ticketAdminKeyboard(ticket, adminId)
        }
      );

      saveTicketAdminMessage(ticket.id, adminId, msg.message_id);
    } catch (e) {
      console.error("Не удалось отправить карточку тикета админу", adminId, e.message);
    }
  }
}

// ---------------- START ----------------

bot.start((ctx) => {
  const u = ctx.from;
  const payload = ctx.startPayload;

  const exists = db.prepare("SELECT * FROM users WHERE id = ?").get(u.id);
  if (!exists) {
    db.prepare(`
      INSERT INTO users (id, username, created_at)
      VALUES (?, ?, datetime('now'))
    `).run(u.id, u.username);
  }

  // Рефералка
  if (payload && payload.startsWith("ref_")) {
    const referrer = Number(payload.replace("ref_", ""));

    if (referrer !== u.id) {
      const already = db.prepare(`
        SELECT * FROM referrals WHERE invited_id = ?
      `).get(u.id);

      if (!already) {
        db.prepare(`
          INSERT INTO referrals (user_id, invited_id, created_at)
          VALUES (?, ?, datetime('now'))
        `).run(referrer, u.id);

        db.prepare(`
          INSERT INTO ref_bonus (user_id, days, created_at)
          VALUES (?, ?, datetime('now'))
        `).run(referrer, REF_BONUS_DAYS);

        ctx.telegram.sendMessage(
          referrer,
          `🎉 Твой друг присоединился по реферальной ссылке!\nТебе начислено +${REF_BONUS_DAYS} дня.`
        );
      }
    }
  }

  ctx.reply(
    "Добро пожаловать в *AstraGuardVPN*!\n\nВыбери действие:",
    { ...mainMenu(), parse_mode: "Markdown" }
  );
});

// ---------------- ПРОБНЫЙ ДОСТУП ----------------

bot.action("trial", async (ctx) => {
  await ctx.answerCbQuery();
  const url = await keygen.giveTrial(ctx.from.id);
  if (!url) return ctx.reply("Ты уже использовал пробный доступ.", mainMenu());
  ctx.reply(`🎁 *Твой пробный VPN:*\n${url}`, { parse_mode: "Markdown" });
});

// ---------------- ПОКУПКА VPN ----------------

bot.action("buy", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText("Выбери тариф:", buyMenu());
});

async function askPromo(ctx, planDays, basePrice) {
  const userId = ctx.from.id;

  db.prepare(`DELETE FROM purchases WHERE user_id = ?`).run(userId);

  db.prepare(`
    INSERT INTO purchases (user_id, days, base_price, promo_id)
    VALUES (?, ?, ?, NULL)
  `).run(userId, planDays, basePrice);

  await ctx.reply(
    "Если у тебя есть промокод — введи его сообщением.\nИли нажми кнопку:",
    Markup.inlineKeyboard([[Markup.button.callback("Пропустить", "promo_skip")]])
  );
}

TARIFFS.forEach(t => {
  bot.action(t.callback, async (ctx) => {
    await ctx.answerCbQuery();
    await askPromo(ctx, t.days, t.price);
  });
});

bot.action("promo_skip", async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from.id;
  const purchase = db.prepare(`SELECT * FROM purchases WHERE user_id = ?`).get(userId);
  if (!purchase) return ctx.reply("Покупка не найдена.", mainMenu());

  const amount = purchase.base_price;
  const code = yoomoney.createPayment(userId, amount, purchase.days);

  ctx.reply(
    `💳 *Оплата через ЮMoney*\n\nПереведи *${amount}₽* на кошелёк:\n\`${YOOMONEY_WALLET}\`\n\nВ комментарии укажи код:\n\`${code}\`\n\nПосле оплаты отправь *чек* сюда.`,
    { parse_mode: "Markdown" }
  );
});

// ---------------- ПОЛУЧЕНИЕ ЧЕКОВ ----------------

attachCheckHandler(bot, mainMenu);

// ---------------- САППОРТ: МЕНЮ ----------------

bot.action("support", async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from.id;

  // Если пользователь — обычный
  if (!isAdmin(userId)) {
    return ctx.reply("🛠 Выбери действие:", supportMenu());
  }

  // Если админ — показываем список тикетов
  const tickets = db.prepare(`
    SELECT * FROM tickets
    ORDER BY id DESC
  `).all();

  if (tickets.length === 0) {
    return ctx.reply("📭 Активных тикетов нет.");
  }

  for (const t of tickets) {
    const user = { id: t.user_id };
    const adminUser = { id: t.admin_id };

    const text = buildTicketCardText(t, user, adminUser);

    await ctx.reply(
      text,
      {
        parse_mode: "Markdown",
        ...ticketAdminKeyboard(t, userId)
      }
    );
  }
});


bot.action("support_write", async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from.id;

  ctx.reply(
    "✏ Напиши сообщение для поддержки.\nБудет создан тикет, и админы его увидят.",
    ticketUserKeyboard(0) // 0 — заглушка, реальный ticketId появится после первого сообщения
  );
});

// ---------------- ТЕКСТ ОТ ПОЛЬЗОВАТЕЛЯ (ТИКЕТЫ) ----------------

bot.on("text", async (ctx, next) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  // Если это админ — не обрабатываем как тикет, идём дальше
  if (isAdmin(userId)) {
    return next();
  }

  // Проверяем, есть ли активный тикет
  let ticket = getActiveTicketByUser(userId);

  if (!ticket) {
    // Создаём новый тикет
    ticket = createTicket(userId);
  }

  // Добавляем сообщение пользователя в историю
  addTicketMessage(ticket.id, "user", userId, text);

  // Если тикет ещё не взят — отправляем карточки всем админам
  if (ticket.status === "open") {
    await sendNewTicketCardsToAdmins(bot, ticket, text);
  } else {
    // Тикет уже взят — отправляем сообщение только тому админу, который ведёт тикет
    if (ticket.admin_id) {
      try {
        await bot.telegram.sendMessage(
          ticket.admin_id,
          `📩 Новое сообщение в тикете #${ticket.id} от пользователя ${userId}:\n${text}`
        );
      } catch (e) {
        console.error("Не удалось отправить сообщение админу по тикету", e.message);
      }
    }
  }

  // Обновляем карточки тикета у всех админов (история изменилась)
  await refreshTicketCardsForAdmins(bot, ticket);

  // Отвечаем пользователю
  ctx.reply(
    `Сообщение добавлено в тикет #${ticket.id}. Ожидай ответа.`,
    ticketUserKeyboard(ticket.id)
  );
});

// ---------------- КОЛБЭКИ ПОЛЬЗОВАТЕЛЯ: ЗАКРЫТЬ ТИКЕТ ----------------

bot.action(/ticket_user_close_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from.id;
  const ticketId = Number(ctx.match[1]);

  const ticket = getTicketById(ticketId);
  if (!ticket || ticket.user_id !== userId) {
    return ctx.editMessageText("Этот тикет уже закрыт или тебе не принадлежит.");
  }

  // Удаляем тикет полностью
  deleteTicketCompletely(ticketId);

  // Пытаемся обновить/удалить карточки у админов
  const adminMessages = getTicketAdminMessages(ticketId);
  for (const am of adminMessages) {
    try {
      await bot.telegram.editMessageText(
        am.admin_id,
        am.message_id,
        null,
        `Тикет #${ticketId} был закрыт пользователем и удалён.`
      );
    } catch (e) {
      console.error("Не удалось обновить карточку тикета при закрытии пользователем", e.message);
    }
  }

  ctx.editMessageText("Тикет закрыт и удалён. Если понадобится помощь — создай новый через поддержку.");
});

// ---------------- КОЛБЭКИ АДМИНА ПО ТИКЕТАМ ----------------

// Взять тикет
bot.action(/ticket_take_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const adminId = ctx.from.id;
  if (!isAdmin(adminId)) {
    return ctx.reply("Эта кнопка только для админов.");
  }

  const ticketId = Number(ctx.match[1]);
  let ticket = getTicketById(ticketId);
  if (!ticket) {
    return ctx.editMessageText(`Тикет #${ticketId} уже не существует.`);
  }

  if (ticket.status === "taken") {
    return ctx.reply(`Тикет #${ticketId} уже занят другим админом.`);
  }

  // Обновляем тикет: назначаем админа и статус taken
  ticket = updateTicketStatus(ticketId, { status: "taken", admin_id: adminId });

  // Обновляем карточки у всех админов
  await refreshTicketCardsForAdmins(bot, ticket);

  // Сообщаем админу
  ctx.reply(`Ты взял тикет #${ticketId}. Теперь только ты можешь отвечать и закрывать его.`);
});

// Админ нажимает "Ответить" (мы просто даём ему подсказку, что нужно ответить реплаем)
bot.action(/ticket_reply_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const adminId = ctx.from.id;
  if (!isAdmin(adminId)) {
    return ctx.reply("Эта кнопка только для админов.");
  }

  const ticketId = Number(ctx.match[1]);
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    return ctx.reply(`Тикет #${ticketId} уже не существует.`);
  }

  if (ticket.admin_id !== adminId) {
    return ctx.reply("Ты не владелец этого тикета. Ответить может только тот, кто его взял.");
  }

  ctx.reply(
    `Чтобы ответить пользователю по тикету #${ticketId}, просто ответь *реплаем* на любое сообщение этого тикета (карточку или уведомление).`,
    { parse_mode: "Markdown" }
  );
});

// Админ пытается нажать на "занят другим"
bot.action(/ticket_busy_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery("Тикет уже занят другим админом.");
});

// Админ закрывает тикет
bot.action(/ticket_close_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const adminId = ctx.from.id;
  if (!isAdmin(adminId)) {
    return ctx.reply("Эта кнопка только для админов.");
  }

  const ticketId = Number(ctx.match[1]);
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    return ctx.reply(`Тикет #${ticketId} уже не существует.`);
  }

  if (ticket.admin_id !== adminId) {
    return ctx.reply("Закрыть тикет может только админ, который его взял.");
  }

  // Удаляем тикет полностью
  deleteTicketCompletely(ticketId);

  // Обновляем карточки у админов
  const adminMessages = getTicketAdminMessages(ticketId);
  for (const am of adminMessages) {
    try {
      await bot.telegram.editMessageText(
        am.admin_id,
        am.message_id,
        null,
        `Тикет #${ticketId} был закрыт админом и удалён.`
      );
    } catch (e) {
      console.error("Не удалось обновить карточку тикета при закрытии админом", e.message);
    }
  }

  // Уведомляем пользователя
  try {
    await bot.telegram.sendMessage(
      ticket.user_id,
      `Твой тикет #${ticketId} был закрыт. Если понадобится помощь — создай новый через поддержку.`
    );
  } catch (e) {
    console.error("Не удалось уведомить пользователя о закрытии тикета", e.message);
  }

  ctx.reply(`Тикет #${ticketId} закрыт и удалён.`);
});

// ---------------- ОТВЕТ АДМИНА РЕПЛАЕМ ----------------

bot.on("message", async (ctx, next) => {
  const fromId = ctx.from.id;

  // Если не админ — пропускаем дальше (это уже обработано в on("text"))
  if (!isAdmin(fromId)) {
    return next();
  }

  // Нас интересуют только текстовые сообщения админа
  if (!ctx.message || !ctx.message.text) {
    return next();
  }

  // Должен быть reply_to_message, чтобы понять, к какому тикету относится
  const reply = ctx.message.reply_to_message;
  if (!reply || !reply.text) {
    return next();
  }

  const text = ctx.message.text;

  // Пытаемся вытащить номер тикета из текста реплая
  const match = reply.text.match(/Тикет\s*#(\d+)/);
  if (!match) {
    // Возможно, это уведомление вида "Новое сообщение в тикете #123..."
    const match2 = reply.text.match(/тикете\s*#(\d+)/i);
    if (!match2) {
      return next();
    }
    match2[1] && (match[1] = match2[1]);
  }

  const ticketId = Number(match[1]);
  if (!ticketId) {
    return next();
  }

  const ticket = getTicketById(ticketId);
  if (!ticket) {
    return ctx.reply(`Тикет #${ticketId} уже не существует.`);
  }

  if (ticket.admin_id !== fromId) {
    return ctx.reply("Ответить по тикету может только админ, который его взял.");
  }

  // Добавляем сообщение админа в историю
  addTicketMessage(ticketId, "admin", fromId, text);

  // Отправляем пользователю
  try {
    await bot.telegram.sendMessage(
      ticket.user_id,
      `🛠 Ответ поддержки по тикету #${ticketId}:\n${text}`,
      ticketUserKeyboard(ticketId)
    );
  } catch (e) {
    console.error("Не удалось отправить ответ пользователю по тикету", e.message);
  }

  // Обновляем карточки у админов
  await refreshTicketCardsForAdmins(bot, ticket);

  // Админу можно ничего не отвечать, он и так видит свой текст
});

// ---------------- РЕФЕРАЛКА ----------------

bot.action("referral", async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from.id;
  const link = `https://t.me/${ctx.botInfo.username}?start=ref_${userId}`;

  const count = db.prepare(`SELECT COUNT(*) AS c FROM referrals WHERE user_id = ?`).get(userId).c;
  const bonus = db.prepare(`SELECT SUM(days) AS d FROM ref_bonus WHERE user_id = ?`).get(userId).d || 0;

  ctx.reply(
    `👥 *Реферальная программа AstraGuardVPN*\n\nТвоя ссылка:\n${link}\n\nПриглашено: *${count}*\nБонусных дней: *${bonus}*`,
    { parse_mode: "Markdown" }
  );
});

// ---------------- МОИ VPN ----------------

bot.action("myvpn", async (ctx) => {
  await ctx.answerCbQuery();
  const keys = await keygen.getUserKeys(ctx.from.id);

  if (!keys || keys.length === 0) {
    return ctx.reply("У тебя пока нет активных VPN-ключей.", mainMenu());
  }

  let text = "🔑 *Твои VPN-ключи:*\n\n";
  keys.forEach(k => {
    text += `• ${k.url} — ${k.days} дней\n`;
  });

  ctx.reply(text, { parse_mode: "Markdown" });
});

// ---------------- ПЛАТЁЖНЫЕ АДМИН-ХЕНДЛЕРЫ ----------------

attachPaymentAdminHandlers(bot);

// ---------------- НАЗАД В ГЛАВНОЕ МЕНЮ ----------------

bot.action("back_main", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText("Выбери действие:", mainMenu());
});

// ---------------- ЗАПУСК ----------------

bot.launch();
console.log("Бот запущен с системой тикетов!");
