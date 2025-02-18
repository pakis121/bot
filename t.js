process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const mineflayer = require("mineflayer");
const readline = require("readline");
const FlayerCaptcha = require("flayercaptcha");
const autoClickerPlugin = require("mineflayer-autoclicker");
const { createCanvas, loadImage } = require("canvas");
const { exec } = require('child_process'); // Для перезапуска процесса
// Удалён дублирующийся импорт: const bot = require('your-bot-library');
const axios = require('axios');
const path = require("path");
const fs = require("fs");
const { Client, GatewayIntentBits } = require('discord.js');
const { ProxyAgent } = require('proxy-agent');
const socks = require('socks').SocksClient;
const { mcUsername, mcPassword, mcServerHost, mcServerPort, proxyHost, proxyPassword, proxyPort, proxyUsername, web1, token, channelId, messages } = require('./config_nu_kak_.json');
const { createBot } = mineflayer;

// Создаём майнкрафт-бота с помощью mineflayer
const bot = createBot({
  username: mcUsername,
  password: mcPassword,
  host: mcServerHost,
  port: mcServerPort,
  version: '1.16.5', // Укажите версию сервера
  agent: new ProxyAgent({ 
    protocol: 'socks5:', 
    host: proxyHost, 
    port: proxyPort, 
    username: proxyUsername, 
    password: proxyPassword 
  }),
  connect: (client) => {
    socks.createConnection({
      proxy: {
        host: proxyHost,
        port: proxyPort,
        type: 5,
        userId: proxyUsername,
        password: proxyPassword
      },
      command: 'connect',
      destination: {
        host: mcServerHost,
        port: mcServerPort
      }
    }, (err, info) => {
      if (err) {
        console.log(err);
        return;
      }
      client.setSocket(info.socket);
      client.emit('connect');
    });
  }
});

bot.once('spawn', () => console.log('spawned'));

let autoclickerActive = false;
let isSneaking = false;
let autoEat = false;
let showChat = true;
let loops = {}; // Храним активные циклы сообщений

const whitelist = ["Auto1click", "pakistan_3332", "malika_", "rak_3122331", "pakistan_33132", "nu_kak_"];
const hostileMobs = ["zombie", "skeleton", "creeper", "spider", "enderman"];

bot.loadPlugin(autoClickerPlugin);

// Создаём интерфейс для консольных команд
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// === Команды из консоли ===
rl.on("line", (input) => {
  const args = input.split(" ");
  const command = args[0];

  switch (command) {
    case "on":
      bot.autoclicker.start();
      autoclickerActive = true;
      console.log("🔫 Автокликер ВКЛЮЧЕН");
      break;
    case "off":
      bot.autoclicker.stop();
      autoclickerActive = false;
      console.log("❌ Автокликер ВЫКЛЮЧЕН");
      break;
    case "inv":
      // Отправка текстового списка инвентаря в консоль
      showInventoryConsole();
      break;
    case "inventory":
      // Создание скриншота инвентаря и отправка в Discord
      saveInventorySnapshot().catch(err => console.error(err));
      break;
    case "sit":
      toggleSneak();
      break;
    case "eat":
      autoEat = !autoEat;
      console.log(`Авто-еда: ${autoEat ? "ВКЛЮЧЕНА" : "ВЫКЛЮЧЕНА"}`);
      break;
    case "chat":
      showChat = !showChat;
      console.log(`Отображение чата: ${showChat ? "ВКЛЮЧЕНО" : "ВЫКЛЮЧЕНО"}`);
      break;
    case "autoleave":
      autoLeave = !autoLeave;
      console.log(`Авто-выход: ${autoLeave ? "ВКЛЮЧЕН" : "ВЫКЛЮЧЕН"}`);
      break;
    case "slot":
      bot.setQuickBarSlot(parseInt(args[1]));
      break;
    case "say":
      bot.chat(args.slice(1).join(" "));
      break;
    case "loop":
      if (args.length < 3) {
        console.log("Использование: loop [id] [текст] [мс]");
        return;
      }
      {
        const loopId = args[1];
        const message = args.slice(2, -1).join(" ");
        const delay = parseInt(args[args.length - 1]);
        if (loops[loopId]) {
          console.log(`Цикл '${loopId}' уже запущен.`);
          return;
        }
        startLoop(loopId, message, delay);
      }
      break;
    case "stoploop":
      if (args[1]) {
        stopLoop(args[1]);
      } else {
        stopAllLoops();
      }
      break;
    case "listloop":
      console.log("Активные циклы:", Object.keys(loops));
      break;
    case "players":
      console.log(`Игроков в зоне прогрузки: ${Object.keys(bot.players).length}`);
      break;
    case "help":
      showCommands();
      break;
    case "drop":
      if (args[1]) {
        const slot = parseInt(args[1]);
        if (!isNaN(slot)) {
          dropItem(slot);
        } else {
          console.log("❌ Укажите корректный номер слота.");
        }
      }
      break;
    case "startM":
      startMessageLoops();
      break;
    case "stopM":
      stopAllMessageLoops();
      break;
    case "listLoops":
      console.log("Активные циклы сообщений:", Object.keys(messageLoops));
      break;
    case "exit":
      process.exit();
      break;
    case "restartBot":
      stopAndRestartBot(); // Команда для перезапуска бота
      break;
    default:
      console.log("Неизвестная команда. Введите help для списка.");
  }
});

// === Discord бот ===
const discordBot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

let mcChatEnabled = false; // Пересылка сообщений Minecraft в Discord

// Функция для отправки текстового списка инвентаря в Discord
function showInventoryDiscord(msg) {
  if (!bot.inventory) {
    msg.reply("⚠️ Инвентарь недоступен!");
    return;
  }
  const items = bot.inventory.items();
  if (items.length === 0) {
    msg.reply("🎒 Инвентарь пуст!");
    return;
  }
  let invList = "📦 **Инвентарь:**\n";
  items.forEach((item) => {
    invList += `🔹 ${item.name} (x${item.count})\n`;
  });
  msg.reply(invList);
}

// Обработчик сообщений Discord
discordBot.on('messageCreate', (message) => {
  if (message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();
  switch (command) {
    case "!say":
      bot.chat(args.slice(1).join(" "));
      message.reply("✅ Сообщение отправлено в чат Minecraft!");
      break;
    case "!on":
      bot.autoclicker.start();
      message.reply("🔫 Автокликер ВКЛЮЧЕН");
      break;
    case "!mcchat":
      mcChatEnabled = !mcChatEnabled;
      message.reply(`📢 Пересылка сообщений Minecraft: ${mcChatEnabled ? "ВКЛЮЧЕНА" : "ВЫКЛЮЧЕНА"}`);
      break;
    case "!off":
      bot.autoclicker.stop();
      message.reply("❌ Автокликер ВЫКЛЮЧЕН");
      break;
    case "!inv":
      showInventoryDiscord(message);
      break;
    case "!players":
      message.reply(`🧑‍🤝‍🧑 Игроков рядом: ${Object.keys(bot.players).length}`);
      break;
    case "!exit":
      message.reply("🚪 Отключаюсь...");
      bot.end();
      discordBot.destroy();
      break;
    case '!loop':
      if (args.length < 4) {
        message.channel.send("Использование: !loop [id] [текст] [мс]");
        return;
      }
      const loopId = args[1];
      const messageText = args.slice(2, -1).join(" ");
      const delay = parseInt(args[args.length - 1]);
      if (loops[loopId]) {
        message.channel.send(`Цикл '${loopId}' уже запущен.`);
        return;
      }
      startLoop(loopId, messageText, delay);
      message.channel.send(`Цикл '${loopId}' запущен!`);
      break;
    case '!stoploop':
      if (args[1]) {
        stopLoop(args[1]);
        message.channel.send(`Цикл '${args[1]}' остановлен.`);
      } else {
        stopAllLoops();
        message.channel.send("Все циклы остановлены.");
      }
      break;
    case '!listloop':
      if (Object.keys(loops).length === 0) {
        message.channel.send("Нет активных циклов.");
      } else {
        message.channel.send(`Активные циклы: ${Object.keys(loops).join(', ')}`);
      }
      break;
    case "!startM":
      startMessageLoops();
      message.reply("Циклы сообщений запущены.");
      break;
    case "!stopM":
      stopAllMessageLoops();
      message.reply("Циклы сообщений остановлены.");
      break;
    case "!listLoops":
      message.reply("Активные циклы сообщений: " + Object.keys(messageLoops).join(', '));
      break;
    case '!eat':
      autoEat = !autoEat;
      message.channel.send(`Авто-еда: ${autoEat ? "ВКЛЮЧЕНА" : "ВЫКЛЮЧЕНА"}`);
      break;
    case '!chat':
      showChat = !showChat;
      message.channel.send(`Отображение чата: ${showChat ? "ВКЛЮЧЕНО" : "ВЫКЛЮЧЕНО"}`);
      break;
    case '!slot':
      if (args.length < 2 || isNaN(args[1])) {
        message.channel.send("Использование: !slot [номер слота]");
        return;
      }
      const slotNumber = parseInt(args[1]);
      message.channel.send(`Слот быстрого доступа изменен на: ${slotNumber}`);
      break;
    case "sit":
      toggleSneak();
      message.reply("👀 Присесть/ползти: Включено/Выключено");
      break;
    case "!invss":
      saveInventorySnapshot().catch(err => console.error(err));
      message.reply("📸 Создаётся скриншот инвентаря...");
      break;
    default:
      message.reply('❓ Неизвестная команда! Доступные: !say, !on, !off, !inv, !invss, !players, !exit, !loop, !stoploop, !listloops, !eat, !chat, !slot, sit, !mcchat');
  }
});

// === Функции циклов сообщений ===
function startLoop(loopId, messageText, delay) {
  loops[loopId] = setInterval(() => bot.chat(messageText), delay);
  console.log(`Цикл '${loopId}' запущен с интервалом ${delay} мс.`);
}

function stopLoop(loopId) {
  if (loops[loopId]) {
    clearInterval(loops[loopId]);
    delete loops[loopId];
    console.log(`Цикл '${loopId}' остановлен.`);
  }
}

function stopAllLoops() {
  Object.keys(loops).forEach(loopId => {
    clearInterval(loops[loopId]);
    delete loops[loopId];
  });
  console.log("Все циклы остановлены.");
}

function showCommands() {
  console.log(`\nДоступные команды:
  - on: Включить автокликер
  - off: Выключить автокликер
  - sit: Переключить приседание
  - eat: Включить/выключить авто-еду
  - chat: Включить/выключить чат
  - autoleave: Включить/выключить авто-выход
  - slot [0-8]: Сменить слот
  - say [текст]: Написать в чат
  - loop [id] [текст] [мс]: Повторять сообщение
  - stoploop [id]: Остановить конкретный цикл
  - stoploop: Остановить все циклы
  - listloops: Показать активные циклы
  - players: Показать игроков рядом
  - inv / inventory: Показать инвентарь (консоль) или создать скриншот и отправить в Discord (!invss)
  - drop [номер слота]: Выбросить предмет из указанного слота
  - help: Показать этот список
  - exit: Выход из программы
  `);
}

// === Функция показа инвентаря в консоли ===
function showInventoryConsole() {
  if (!bot.inventory) {
    console.log("⚠️ Инвентарь недоступен!");
    return;
  }
  const items = bot.inventory.items();
  if (items.length === 0) {
    console.log("🎒 Инвентарь пуст!");
    return;
  }
  console.log("\n📦 Содержимое инвентаря:");
  items.forEach((item) => {
    console.log(`🔢 Слот: ${item.slot} | ${item.name} (x${item.count})`);
  });
  console.log("");
}

// === Функция переключения приседания ===
function toggleSneak() {
  isSneaking = !isSneaking;
  bot.setControlState("sneak", isSneaking);
  console.log(`Приседание: ${isSneaking ? "ВКЛЮЧЕНО" : "ВЫКЛЮЧЕНО"}`);
}

bot.on("respawn", () => {
  console.log("sit");
  toggleSneak();
  setTimeout(() => {
    console.log("sit");
    toggleSneak();
  }, 1500);
});

// === Авто-еда ===
let isEating = false;

async function tryEat() {
  if (isEating) return;
  isEating = true;
  const items = bot.inventory.items();
  const foodNames = [
    "apple",
    "bread",
    "cooked_beef",
    "cooked_porkchop",
    "cooked_rabbit",
    "carrot",
    "potato",
    "golden_apple",
    "mushroom_stew",
    "beetroot_soup",
    "cooked_chicken",
    "cooked_mutton",
    "cooked_cod",
    "cooked_salmon",
    "sweet_berries",
    "enchanted_golden_apple",
    "golden_carrot",
  ];
  const food = items.find((item) => foodNames.includes(item.name));
  if (!food) {
    console.log("🚫 Еда не найдена.");
    isEating = false;
    return;
  }
  console.log(`🍖 Найдена еда: ${food.name}. Бот пытается её съесть...`);
  const previousSlot = bot.quickBarSlot;
  try {
    await bot.equip(food, "hand");
    await bot.consume();
    console.log("✅ Поел!");
  } catch (err) {
    console.log("❌ Ошибка при еде:", err);
  }
  setTimeout(() => {
    bot.setQuickBarSlot(previousSlot);
    console.log(`🔄 Вернули слот обратно: ${previousSlot}`);
    isEating = false;
  }, 2500);
}

bot.on("health", async () => {
  if (bot.food < 20 && autoEat && !isEating) {
    console.log("🍽️ Мало еды, бот пытается поесть...");
    await tryEat();
  }
});

bot.on("health", async () => {
  if (bot.food < 20 && autoEat) {
    console.log("🍽️ Мало еды, бот пытается поесть...");
    await tryEat();
  }
});

// === Обработчик сообщений в чат (Minecraft) ===
bot.on("message", (message) => {
  if (showChat) console.log(`[CHAT] ${message.toAnsi()}`);
});

// === Авто-выход при обнаружении постороннего игрока ===
const DISCORD_WEBHOOK_URL = web1;

async function sendDiscordMessage(content) {
  try {
    await axios.post(DISCORD_WEBHOOK_URL, { content });
  } catch (error) {
    console.error("❌ Ошибка отправки в Discord:", error);
  }
}

function isWhitelisted(playerName) {
  return whitelist.includes(playerName);
}

let autoLeave = false;
let hasSentHubMessage = false;
let lastDimension = null;
let isInHubOnce = false;
let lastHubEnterTime = null;

const HUB_COORDS = { x: 0.500, y: 100, z: 0.500 };
const HUB_RADIUS = 20;
const HUB_DELAY_TIME = 5000;

function isInHub() {
  const distanceToHub = bot.entity.position.distanceTo(HUB_COORDS);
  return distanceToHub < HUB_RADIUS;
}

bot.on("physicTick", async () => {
  const currentInHub = isInHub();
  if (currentInHub && !isInHubOnce) {
    autoLeave = false;
    isInHubOnce = true;
    lastHubEnterTime = Date.now();
    lastDimension = "hub";
  }
  if (isInHubOnce && Date.now() - lastHubEnterTime > HUB_DELAY_TIME) {
    isInHubOnce = false;
  }
  if (!currentInHub && isInHubOnce) {
    autoLeave = true;
    console.log("🟢 Бот не в хабе, автолив включен.");
    isInHubOnce = false;
    lastDimension = "other";
  }
  if (!autoLeave || hasSentHubMessage) return;
  const nearbyPlayers = Object.values(bot.players).filter(
    (player) =>
      player.entity &&
      player.entity.position &&
      bot.entity.position.distanceTo(player.entity.position) < 100
  );
  for (const player of nearbyPlayers) {
    if (isWhitelisted(player.username)) continue;
    if (player.entity) {
      const playerName = player.username;
      console.log(`⚠️ Опасность! Игрок ${playerName} рядом! Переходим в /hub!`);
      hasSentHubMessage = true;
      autoLeave = false;
      await sendDiscordMessage(`⚠️ **Бот перешел в /hub!** Игрок **${playerName}** был рядом.`);
      bot.chat("/hub");
      setTimeout(() => { hasSentHubMessage = false; }, 5000);
    }
  }
});

// === (Опционально) Обработка капчи ===
// const captcha = new FlayerCaptcha(bot);
// captcha.on("success", async (image) => {
//   await image.toFile("captcha.png");
//   console.log("Captcha сохранена.");
// });

// === Карта координат слотов инвентаря (для скриншота) ===
const slotPositions = {
  armor: [
    [8, 8],
    [8, 26],
    [8, 44],
    [8, 62],
  ], // Броня (шлем -> ботинки)
  offhand: [[152, 62]], // Левая рука
  main: [...Array(27).keys()].map((i) => [
    8 + (i % 9) * 18,
    84 + Math.floor(i / 9) * 18,
  ]), // Основной инвентарь (9х3)
  hotbar: [...Array(9).keys()].map((i) => [8 + i * 18, 142]), // Быстрая панель (слоты 36-44!)
};

console.warn = () => {}; // Отключаем предупреждения

// === Функция дропа предмета из указанного слота ===
function dropItem(slot) {
  const item = bot.inventory.slots[slot];
  if (!item) {
    console.log(`❌ Слот ${slot} пуст.`);
    return;
  }
  bot.tossStack(item, (err) => {
    if (err) {
      console.log(`❌ Ошибка при выбрасывании предмета из слота ${slot}:`, err);
    } else {
      console.log(`✅ Выброшен предмет: ${item.name} (слот ${slot})`);
    }
  });
}

// Добавляем команду drop через консоль и Discord
rl.on("line", (input) => {
  const args = input.split(" ");
  const command = args[0];
  if (command === "drop" && args[1]) {
    const slot = parseInt(args[1]);
    if (!isNaN(slot)) {
      dropItem(slot);
    } else {
      console.log("❌ Укажите корректный номер слота.");
    }
  }
});

discordBot.on('messageCreate', (message) => {
  if (message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();
  if (command === "!drop" && args[1]) {
    const slot = parseInt(args[1]);
    if (!isNaN(slot)) {
      dropItem(slot);
      message.reply(`✅ Выброшен предмет из слота ${slot}`);
    } else {
      message.reply("❌ Укажите корректный номер слота.");
    }
  }
});

// Пересылка чата Minecraft в Discord (без цветовых кодов)
bot.on("message", (jsonMsg) => {
  if (!mcChatEnabled) return;
  let chatMessage = jsonMsg.toString().replace(/\u00A7./g, "");
  const channel = discordBot.channels.cache.get(channelId);
  if (channel) {
    channel.send(`📢 **Minecraft Chat:** ${chatMessage}`);
  }
});

// === Функция создания скриншота инвентаря и отправки его в Discord ===
async function saveInventorySnapshot() {
  const inventory = bot.inventory.slots;
  const canvas = createCanvas(176, 166); // Размер GUI инвентаря
  const ctx = canvas.getContext("2d");
  console.log("📦 Создаём снимок инвентаря...");
  
  // Загрузка фонового изображения
  try {
    const background = await loadImage(path.join(__dirname, "inventory_background.png"));
    ctx.drawImage(background, 0, 0);
  } catch (err) {
    console.warn("⚠️ Фон инвентаря не найден. Используется пустой фон.");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  
  // Отрисовка предметов
  for (let slot = 0; slot < inventory.length; slot++) {
    const item = inventory[slot];
    if (!item) continue;
    let position;
    if (slot >= 5 && slot <= 8)
      position = slotPositions.armor[slot - 5];
    else if (slot === 45)
      position = slotPositions.offhand[0];
    else if (slot >= 9 && slot <= 35)
      position = slotPositions.main[slot - 9];
    else if (slot >= 36 && slot <= 44)
      position = slotPositions.hotbar[slot - 36];
    else continue;
    
    const iconPath = path.join(__dirname, "icons", `${item.name}.png`);
    if (fs.existsSync(iconPath)) {
      const img = await loadImage(iconPath);
      ctx.drawImage(img, position[0], position[1], 16, 16);
      if (item.count > 1) {
        ctx.font = "12px Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.fillText(item.count, position[0] + 16, position[1] + 16);
      }
    } else {
      console.warn(`⚠️ Иконка для ${item.name} не найдена.`);
    }
  }
  
  // Сохранение изображения
  const filePath = path.join(__dirname, "inventory.png");
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(filePath, buffer);
  console.log("📸 Снимок инвентаря сохранен как inventory.png");
  
  // Отправка скриншота в Discord
  await sendInventoryScreenshotToDiscord(filePath);
}

// Функция отправки скриншота в Discord через Discord-бота
async function sendInventoryScreenshotToDiscord(filePath) {
  try {
    const channel = discordBot.channels.cache.get(channelId);
    if (!channel) {
      console.error("Канал Discord не найден!");
      return;
    }
    await channel.send({ files: [filePath] });
    console.log("Скриншот инвентаря отправлен в Discord!");
  } catch (error) {
    console.error("Ошибка отправки скриншота в Discord:", error);
  }
}

// Вход в Discord
discordBot.login(token);




let messageLoops = {}; // Объект для хранения активных циклов сообщений

// Функция для запуска цикла сообщений с разными интервалами
function startMessageLoops() {
  messages.forEach((msgObj, index) => {
    const loopId = `loop_${index}`;
    if (!messageLoops[loopId]) {
      messageLoops[loopId] = setInterval(() => {
        bot.chat(msgObj.message);
        console.log(`Сообщение "${msgObj.message}" отправлено!`);
      }, msgObj.interval);
      console.log(`Цикл "${loopId}" запущен с интервалом ${msgObj.interval} мс.`);
    }
  });
}

// Функция для остановки всех циклов
function stopAllMessageLoops() {
  Object.keys(messageLoops).forEach(loopId => {
    clearInterval(messageLoops[loopId]);
    delete messageLoops[loopId];
    console.log(`Цикл "${loopId}" остановлен.`);
  });
}

// Запуск циклов сообщений при старте бота
startMessageLoops(); // Автоматически запускаем циклы при старте бота
