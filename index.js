const { Telegraf, Markup } = require("telegraf");
const http = require("http");

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("Нема BOT_TOKEN");

const ADMIN_ID = Number(process.env.ADMIN_ID || "8412933435");

// ===== Health endpoint (Render/UptimeRobot)
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  })
  .listen(PORT, () => console.log("Health server running on port", PORT));

const bot = new Telegraf(token);

// ===== Налаштування STO (під себе відредагуєш)
const STO = {
  name: "STO • Швидкий запис",
  city: "Київ",
  address: "вул. Прикладна, 10",
  hours: "Пн–Сб 09:00–19:00",
  phone: "+380 (__) ___ __ __",
  instagram: "@sto.example",
  services: [
    "Діагностика ходової — 300 грн",
    "Заміна масла — від 400 грн",
    "Гальма (колодки/диски) — від 500 грн",
    "Розвал-сходження — 700 грн",
    "Електрика — від 400 грн",
  ],
  promo: "🔥 Акція: діагностика -20% при записі через бота",
};

// ===== Антиспам
const cooldown = new Map();
const COOLDOWN_MS = 60 * 1000;
const isCoolingDown = (uid) => Date.now() - (cooldown.get(uid) || 0) < COOLDOWN_MS;
const setCooldown = (uid) => cooldown.set(uid, Date.now());

// ===== Сесії заявки
// userId -> { step, data }
const sessions = new Map();

function mainMenu() {
  return Markup.keyboard([
    ["🛠️ Запис/Заявка", "💸 Прайс"],
    ["📍 Адреса", "🧑‍💬 Підтримка"],
  ]).resize();
}

function backToMenuInline() {
  return Markup.inlineKeyboard([[Markup.button.callback("⬅️ В меню", "to_menu")]]);
}

bot.start((ctx) => {
  ctx.reply(
    `🚗 ${STO.name}\n${STO.promo}\n\nОбери дію 👇`,
    mainMenu()
  );
});

bot.action("to_menu", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Меню 👇", mainMenu());
});

bot.hears("💸 Прайс", (ctx) => {
  ctx.reply(
    `💸 Прайс / Послуги:\n• ${STO.services.join("\n• ")}\n\nЩоб записатися — натисни 🛠️ Запис/Заявка.`,
    backToMenuInline()
  );
});

bot.hears("📍 Адреса", (ctx) => {
  ctx.reply(
    `📍 Адреса:\n${STO.city}, ${STO.address}\n🕒 Графік: ${STO.hours}\n📞 Тел: ${STO.phone}\n📷 Insta: ${STO.instagram}`,
    backToMenuInline()
  );
});

bot.hears("🧑‍💬 Підтримка", (ctx) => {
  ctx.reply("Напиши питання одним повідомленням — передам адміну ✅");
});

bot.command("cancel", (ctx) => {
  sessions.delete(ctx.from.id);
  ctx.reply("Скасовано ✅", mainMenu());
});

bot.hears("🛠️ Запис/Заявка", async (ctx) => {
  const uid = ctx.from.id;
  if (isCoolingDown(uid)) return ctx.reply("⏳ Зачекай хвилинку перед новою заявкою 🙌");

  sessions.set(uid, { step: 1, data: {} });
  await ctx.reply("✅ Ок, оформимо заявку.\n\n1/5: Введи ПІБ (прізвище, ім’я, по батькові):");
});

bot.on("text", async (ctx) => {
  const uid = ctx.from.id;
  const text = (ctx.message.text || "").trim();

  const sess = sessions.get(uid);
  if (sess) {
    if (sess.step === 1) {
      sess.data.name = text;
      sess.step = 2;
      sessions.set(uid, sess);
      return ctx.reply("2/5: Телефон або @нік для зв’язку?");
    }
    if (sess.step === 2) {
      sess.data.contact = text;
      sess.step = 3;
      sessions.set(uid, sess);
      return ctx.reply("3/5: Марка/модель авто (наприклад: VW Passat B7)?");
    }
    if (sess.steps
step === 3) {
      sess.data.car = text;
      sess.step = 4;
      sessions.set(uid, sess);
      return ctx.reply("4/5: Що потрібно зробити? (коротко: масло/гальма/діагностика/інше)");
    }
    if (sess.step === 4) {
      sess.data.problem = text;
      sess.step = 5;
      sessions.set(uid, sess);
      return ctx.reply("5/5: Бажаний день/час (наприклад: завтра 15:00). Якщо не важливо — напиши “будь-коли”.");
    }
    if (sess.step === 5) {
      sess.data.time = text;

      const username = ctx.from.username ? `@${ctx.from.username}` : "(нема юзернейма)";
      const contactBtn = Markup.inlineKeyboard([
        [Markup.button.url("✉️ Написати клієнту", `tg://user?id=${uid}`)],
      ]);

      const msg =
        "🚗🆕 ЗАЯВКА STO\n\n" +
        `👤 ПІБ: ${sess.data.name}\n` +
        `📞 Контакт: ${sess.data.contact}\n` +
        `🚘 Авто: ${sess.data.car}\n` +
        `🛠️ Робота: ${sess.data.problem}\n` +
        `🕒 Коли: ${sess.data.time}\n\n` +
        `🆔 UserID: ${uid}\n` +
        `🔗 Username: ${username}`;

      try {
        await ctx.telegram.sendMessage(ADMIN_ID, msg, contactBtn);
      } catch (e) {
        console.log("Не зміг відправити адміну:", e?.message || e);
      }

      sessions.delete(uid);
      setCooldown(uid);

      return ctx.reply("✅ Заявка прийнята! Ми скоро з тобою зв’яжемось 🙌", mainMenu());
    }
  }

  // Якщо не в заявці — вважаємо як підтримка і шлемо адміну
  const username2 = ctx.from.username ? `@${ctx.from.username}` : "(нема юзернейма)";
  const forward =
    "💬 ПОВІДОМЛЕННЯ (STO BOT)\n\n" +
    `Текст: ${text}\n\n` +
    `🆔 UserID: ${uid}\n` +
    `🔗 Username: ${username2}`;

  try {
    await ctx.telegram.sendMessage(ADMIN_ID, forward);
  } catch (e) {
    console.log("Не зміг відправити адміну:", e?.message || e);
  }

  return ctx.reply("Прийняв ✅", mainMenu());
});

bot.catch((err) => console.log("BOT ERROR:", err));

(async () => {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.launch({ dropPendingUpdates: true });
    console.log("Bot launched");
  } catch (e) {
    console.log("Launch failed:", e?.message || e);
    process.exit(1);
  }
})();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
