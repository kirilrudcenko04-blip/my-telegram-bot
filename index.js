const { Telegraf, Markup } = require("telegraf");
const http = require("http");

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("Нема BOT_TOKEN");

const ADMIN_ID = Number(process.env.ADMIN_ID || "8412933435"); // твій chat_id

const bot = new Telegraf(token);

// health endpoint для Render/пінгу
const port = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  })
  .listen(port, () => console.log("Health server running on port", port));

// простий антиспам: 1 заявка раз на 60 сек на користувача
const cooldown = new Map();
const COOLDOWN_MS = 60 * 1000;

// “сцена” для збору заявки
const sessions = new Map(); // userId -> { step, data }

function isCoolingDown(userId) {
  const last = cooldown.get(userId) || 0;
  return Date.now() - last < COOLDOWN_MS;
}
function setCooldown(userId) {
  cooldown.set(userId, Date.now());
}

function mainMenu() {
  return Markup.keyboard([["📦 Прайс", "📩 Заявка"], ["🧠 Підтримка"]]).resize();
}

bot.start((ctx) => {
  ctx.reply(
    "🔥 Привіт! Я бот.\nТут можна отримати прайс або залишити заявку 👇",
    mainMenu()
  );
});

bot.hears("📦 Прайс", (ctx) =>
  ctx.reply(
    "💰 Прайс:\n1) Бот під заявки — 500 грн\n2) Бот-магазин — 1000 грн\n3) Підписка/доступ — 1000 грн\n\nНатисни 📩 Заявка — і напиши що треба."
  )
);

bot.hears("🧠 Підтримка", (ctx) =>
  ctx.reply("Опиши питання одним повідомленням — я передам адміну ✅")
);

bot.hears("📩 Заявка", async (ctx) => {
  const userId = ctx.from.id;

  if (isCoolingDown(userId)) {
    return ctx.reply("⏳ Зачекай хвилинку перед новою заявкою 🙌");
  }

  sessions.set(userId, { step: 1, data: {} });
  await ctx.reply("Ок, зробимо заявку ✅\n\n1/4: Як тебе звати?");
});

bot.command("cancel", (ctx) => {
  sessions.delete(ctx.from.id);
  ctx.reply("Скасовано ✅", mainMenu());
});

// Обробка тексту (і заявка, і підтримка)
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = (ctx.message.text || "").trim();

  // якщо користувач в процесі заявки
  const session = sessions.get(userId);
  if (session) {
    const { step, data } = session;

    if (step === 1) {
      data.name = text;
      sessions.set(userId, { step: 2, data });
      return ctx.reply("2/4: Твій номер або @нік для зв’язку?");
    }

    if (step === 2) {
      data.contact = text;
      sessions.set(userId, { step: 3, data });
      return ctx.reply("3/4: Яка ніша/тема? (наприклад: барбер, магазин, крипта)");
    }

    if (step === 3) {
      data.niche = text;
      sessions.set(userId, { step: 4, data });
      return ctx.reply("4/4: Які функції потрібні боту? (коротко списком)");
    }

    if (step === 4) {
      data.features = text;

      // фінал: відправляємо адміну
      const username = ctx.from.username ? `@${ctx.from.username}` : "(нема юзернейма)";
      const msg =
        "🆕 НОВА ЗАЯВКА\n\n" +
        `👤 Ім'я: ${data.name}\n` +
        `📞 Контакт: ${data.contact}\n` +
        `🏷 Ніша: ${data.niche}\n` +
        `⚙️ Функції: ${data.features}\n\n` +
        `🆔 UserID: ${userId}\n` +
        `🔗 Username: ${username}`;

      try {
        await ctx.telegram.sendMessage(ADMIN_ID, msg);
      } catch (e) {
        // якщо адмін ще не писав боту — Telegram може не дати написати
        console.log("Не зміг відправити адміну:", e?.message || e);
      }

      sessions.delete(userId);
      setCooldown(userId);

      return ctx.reply(
        "✅ Готово! Заявку відправив адміну.\nСкоро тобі напишуть 🙌",
        mainMenu()
      );
    }
  }

  // якщо це просто “підтримка” або будь-який текст — пересилаємо адміну
  // (щоб ти бачив, що пишуть)
  const username = ctx.from.username ? `@${ctx.from.username}` : "(нема юзернейма)";
  const forward =
    "💬 ПОВІДОМЛЕННЯ В БОТА\n\n" +
    `Текст: ${text}\n\n` +
    `🆔 UserID: ${userId}\n` +
    `🔗 Username: ${username}`;

  try {
    await ctx.telegram.sendMessage(ADMIN_ID, forward);
  } catch (e) {
    console.log("Не зміг відправити адміну:", e?.message || e);
  }

  ctx.reply("Прийняв ✅", mainMenu());
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
