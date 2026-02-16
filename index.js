const { Telegraf, Markup } = require("telegraf");
const http = require("http");

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("Нема BOT_TOKEN");

const bot = new Telegraf(token);

// Простий веб-сервер для Render (щоб було що пінгати)
const port = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  })
  .listen(port, () => console.log("Health server running on port", port));

bot.start((ctx) => {
  ctx.reply(
    "🔥 Привіт! Я бот.\nОбери дію:",
    Markup.keyboard([["📦 Прайс", "📩 Заявка"], ["🧠 Підтримка"]]).resize()
  );
});

bot.hears("📦 Прайс", (ctx) =>
  ctx.reply("💰 Прайс:\n1) Бот під заявки — 500 грн\n2) Бот-магазин — 1500 грн\n\nНапиши: Хочу 1")
);

bot.hears("📩 Заявка", (ctx) =>
  ctx.reply("Напиши коротко що тобі потрібно і контакт 👇")
);

bot.on("text", (ctx) =>
  ctx.reply("Отримав 👍 Напиши /start щоб повернутись в меню")
);

bot.launch();
