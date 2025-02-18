require("dotenv").config(); // Загружаем переменные окружения
const { Client, GatewayIntentBits } = require("discord.js");
const { exec } = require("child_process");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Запускаем сервер (нужен для Render)
app.get("/", (req, res) => res.send("Бот работает! 🚀"));
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));

// Создаём бота
const discordBot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const TOKEN = process.env.TOKEN; // Берем токен из переменной окружения
const ADMIN_ID = process.env.ADMIN_ID; // ID админа (лучше тоже хранить в .env)

// Разрешённые команды
const allowedCommands = ["node t.js"];

// Обрабатываем команды
discordBot.on("messageCreate", (message) => {
  if (message.author.bot) return;

  const args = message.content.split(" ");
  const command = args.shift().toLowerCase();

  if (command === "!exec") {
    if (message.author.id !== ADMIN_ID) {
      message.reply("⛔ У тебя нет прав на выполнение команд!");
      return;
    }

    const execCommand = args.join(" ");

    // Разрешаем только конкретные команды
    if (!allowedCommands.includes(execCommand)) {
      message.reply("⚠️ Эта команда запрещена!");
      return;
    }

    exec(execCommand, (error, stdout, stderr) => {
      if (error) {
        message.reply(`❌ Ошибка:\n\`${error.message}\``);
        return;
      }
      if (stderr) {
        message.reply(`⚠️ Ошибка выполнения:\n\`${stderr}\``);
        return;
      }
      message.reply(`✅ Результат:\n\`\`\`${stdout}\`\`\``);
    });
  }
});

// Запускаем бота
discordBot.login(TOKEN);
