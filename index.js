const { Telegraf, Markup } = require("telegraf");
const http = require("http");

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("Нема BOT_TOKEN");

const ADMIN_ID = Number(process.env.ADMIN_ID || "8412933435");

// -------- Health endpoint (Render/UptimeRobot)
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  })
  .listen(PORT, () => console.log("Health server running on port", PORT));

const bot = new Telegraf(token);

// -------- 10 позицій (міняй під свої сумки)
const ITEMS = [
  { id: 1, title: "Coach Tabby (Premium)", price: 1500, desc: "26×14×6.5см • ремінець • коробка+пильник" },
  { id: 2, title: "Michael Kors Tote", price: 1700, desc: "29.5×27.5×13см • на блискавці • кишені" },
  { id: 3, title: "Guess Noelle 2в1", price: 1200, desc: "29×15×6см • регульована ручка • монетниця" },
  { id: 4, title: "Gucci Ophidia (eco)", price: 1500, desc: "23×14×6см • цепочка • QR бірка" },
  { id: 5, title: "Prada Mini (1:1)", price: 2700, desc: "20×11×10см • шкіра • коробка+пильник" },
  { id: 6, title: "Miu Miu Aventure", price: 2600, desc: "32×18×11см • шкіра • без ременя" },
  { id: 7, title: "D&G DG9012", price: 3400, desc: "шкіра • 2 відділи • фурнітура бренд" },
  { id: 8, title: "Chanel Premium", price: 1800, desc: "24.5×14×8см • шкіра • комплект пакування" },
  { id: 9, title: "Cross-body", price: 900, desc: "компактна • 2 кишені • на кожен день" },
  { id: 10, title: "Baguette", price: 1100, desc: "модна форма • коротка ручка • легка" }
];

// -------- Сесії замовлення
// userId -> { step, itemId, data }
const sessions = new Map();

// запам’ятовуємо останній переглянутий товар (щоб авто-стартувати замовлення з першого тексту)
const lastViewed = new Map(); // userId -> { itemId, ts }
const LAST_VIEW_MS = 10 * 60 * 1000; // 10 хв

// антиспам: 1 оформлення раз на 60 сек
const cooldown = new Map();
const COOLDOWN_MS = 60 * 1000;
const isCoolingDown = (uid) => Date.now() - (cooldown.get(uid) || 0) < COOLDOWN_MS;
const setCooldown = (uid) => cooldown.set(uid, Date.now());

function mainMenu() {
  return Markup.keyboard([["👜 Каталог", "📦 Доставка/Оплата"], ["🧑‍💬 Підтримка"]]).resize();
}

function catalogKeyboard() {
  const rows = [];
  for (let i = 0; i < ITEMS.length; i += 2) {
    const a = ITEMS[i];
    const b = ITEMS[i + 1];
    const row = [Markup.button.callback(`${a.id}. ${a.title}`, `item_${a.id}`)];
    if (b) row.push(Markup.button.callback(`${b.id}. ${b.title}`, `item_${b.id}`));
    rows.push(row);
  }
  rows.push([Markup.button.callback("⬅️ В меню", "to_menu")]);
  return Markup.inlineKeyboard(rows);
}

function itemKeyboard(itemId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Купити", `buy_${itemId}`)],
    [Markup.button.callback("⬅️ Назад в каталог", "to_catalog")]
  ]);
}

bot.start((ctx) => {
  ctx.reply("Вітаю! Це магазин сумок 👜\nОбери дію 👇", mainMenu());
});

bot.hears("👜 Каталог", async (ctx) => {
  await ctx.reply("Ось наші позиції (10 шт). Натисни на сумку 👇", catalogKeyboard());
});

bot.hears("📦 Доставка/Оплата", (ctx) => {
  ctx.reply(
    "📦 Доставка/Оплата:\n• Нова Пошта / Укрпошта\n• Оплата: повна або передоплата\n\nЩоб замовити — зайди в 👜 Каталог."
  );
});

bot.hears("🧑‍💬 Підтримка", (ctx) => {
  ctx.reply("Напиши питання текстом — я передам адміну ✅");
});

bot.command("cancel", (ctx) => {
  sessions.delete(ctx.from.id);
  ctx.reply("Скасовано ✅", mainMenu());
});

// -------- Показ товару
bot.action(/^item_(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const item = ITEMS.find((x) => x.id === id);
  if (!item) return ctx.answerCbQuery("Не знайшов товар");

  // запам’ятали, що він дивився цей товар
  lastViewed.set(ctx.from.id, { itemId: item.id, ts: Date.now() });

  await ctx.answerCbQuery();
  await ctx.reply(
    `👜 ${item.title}\n💰 Ціна: ${item.price} грн\n📌 ${item.desc}\n\nНатисни ✅ Купити, або просто напиши ПІБ — і бот почне оформлення.`,
    itemKeyboard(item.id)
  );
});

bot.action("to_catalog", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Каталог 👇", catalogKeyboard());
});

bot.action("to_menu", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Меню 👇", mainMenu());
});

// -------- Старт покупки по кнопці "Купити"
bot.action(/^buy_(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const itemId = Number(ctx.match[1]);
  const item = ITEMS.find((x) => x.id === itemId);
  if (!item) return ctx.answerCbQuery("Не знайшов товар");

  // також запам’ятаємо товар (на випадок, якщо він почне писати)
  lastViewed.set(ctx.from.id, { itemId: item.id, ts: Date.now() });

  if (isCoolingDown(userId)) {
    await ctx.answerCbQuery();
    return ctx.reply("⏳ Зачекай хвилинку перед новим оформленням 🙌");
  }

  sessions.set(userId, { step: 1, itemId, data: {} });

  await ctx.answerCbQuery("Оформлення");
  await ctx.reply(`✅ Оформляємо: ${item.title}\n\n1/4: Введи ПІБ (прізвище, ім’я, по батькові):`);
});

// -------- Текст: або оформлення, або підтримка
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = (ctx.message.text || "").trim();

  // ✅ Авто-старт замовлення: якщо він дивився товар і просто написав текст
  if (!sessions.get(userId)) {
    const lv = lastViewed.get(userId);
    if (lv && Date.now() - lv.ts < LAST_VIEW_MS) {
      if (!isCoolingDown(userId)) {
        // перше повідомлення = ПІБ
        sessions.set(userId, { step: 2, itemId: lv.itemId, data: { name: text } });
        return ctx.reply("2/4: Телефон або @нік для зв’язку?");
      } else {
        return ctx.reply("⏳ Зачекай хвилинку перед новим оформленням 🙌");
      }
    }
  }

  const sess = sessions.get(userId);
  if (sess) {
    const item = ITEMS.find((x) => x.id === sess.itemId);
    if (!item) {
      sessions.delete(userId);
      return ctx.reply("Товар не знайдено. Спробуй ще раз.", mainMenu());
    }

    if (sess.step === 1) {
      sess.data.name = text; // ПІБ
      sess.step = 2;
      sessions.set(userId, sess);
      return ctx.reply("2/4: Телефон або @нік для зв’язку?");
    }

    if (sess.step === 2) {
      sess.data.contact = text;
      sess.step = 3;
      sessions.set(userId, sess);
      return ctx.reply("3/4: Місто та служба доставки (НП/УП)?");
    }

    if (sess.step === 3) {
      sess.data.delivery = text;
      sess.step = 4;
      sessions.set(userId, sess);
      return ctx.reply("4/4: Коментар (колір/передоплата/інші побажання). Якщо нема — напиши “-”");
    }

    if (sess.step === 4) {
      sess.data.comment = text;

      const username = ctx.from.username ? `@${ctx.from.username}` : "(нема юзернейма)";
      const msg =
        "🛒 НОВЕ ЗАМОВЛЕННЯ\n\n" +
        `👜 Товар: ${item.title}\n` +
        `💰 Ціна: ${item.price} грн\n\n` +
        `👤 ПІБ: ${sess.data.name}\n` +
        `📞 Контакт: ${sess.data.contact}\n` +
        `📦 Доставка: ${sess.data.delivery}\n` +
        `📝 Коментар: ${sess.data.comment}\n\n` +
        `🆔 UserID: ${userId}\n` +
        `🔗 Username: ${username}`;

      try {
        await ctx.telegram.sendMessage(ADMIN_ID, msg);
      } catch (e) {
        console.log("Не зміг відправити адміну:", e?.message || e);
      }

      sessions.delete(userId);
      setCooldown(userId);

      return ctx.reply("✅ Замовлення прийнято! Ми скоро з тобою зв’яжемось 🙌", mainMenu());
    }
  }

  // Підтримка: будь-який текст (коли він НЕ оформлює) — адміну
  const usernameSupport = ctx.from.username ? `@${ctx.from.username}` : "(нема юзернейма)";
  const forward =
    "💬 ПОВІДОМЛЕННЯ В МАГАЗИН-БОТІ\n\n" +
    `Текст: ${text}\n\n` +
    `🆔 UserID: ${userId}\n` +
    `🔗 Username: ${usernameSupport}`;

  try {
    await ctx.telegram.sendMessage(ADMIN_ID, forward);
  } catch (e) {
    console.log("Не зміг відправити адміну:", e?.message || e);
  }

  return ctx.reply("Прийняв ✅", mainMenu());
});

// -------- Щоб Render не падав
bot.catch((err) => console.log("BOT ERROR:", err));

(async () => {
  try {
    // прибираємо webhook і чистимо старі апдейти
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
