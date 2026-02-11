// src/telegram/index.js
const TelegramBot = require("node-telegram-bot-api");
const BotConfig = require("../db/models/botConfig");
require("dotenv").config();
const commandHandlers = require("./commands");

// Create a bot instance
let bot;

// Initialize the bot
const initBot = async () => {
  console.log("Initializing Telegram bot...");

  // Create bot instance without polling (we'll implement manual polling)
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: false
  });

  // Start manual polling
  startManualPolling();

  // Handle messages directly instead of using onText (which doesn't work well with manual polling)
  bot.on('message', (msg) => {
    console.log(`📨 Processing message: "${msg.text}" from chat ${msg.chat.id}`);

    if (!msg.text || !msg.text.startsWith('/')) {
      return;
    }

    const command = msg.text.trim();
    const parts = command.split(' ');
    const cmd = parts[0];

    try {
      console.log(`⚡ Executing command: ${cmd}`);

      switch (cmd) {
        case '/start':
          console.log('🚀 Executing /start handler');
          commandHandlers.start(bot, msg);
          break;
        case '/help':
          commandHandlers.help(bot, msg);
          break;
        case '/list':
          commandHandlers.listWallets(bot, msg);
          break;
        case '/status':
          commandHandlers.status(bot, msg);
          break;
        case '/setchatid':
          commandHandlers.setChatId(bot, msg);
          break;
        case '/snipe_list':
          console.log('🎯 Executing /snipe_list handler');
          commandHandlers.snipeList(bot, msg);
          break;
        case '/snipe_pause':
          commandHandlers.snipePause(bot, msg);
          break;
        case '/snipe_resume':
          commandHandlers.snipeResume(bot, msg);
          break;
        case '/snipe_stats':
          commandHandlers.showSnipeStats(bot, msg);
          break;
        case '/add_dev':
          if (parts.length > 1) {
            const match = [command, parts.slice(1).join(' ')];
            commandHandlers.addDevWallet(bot, msg, match);
          } else {
            bot.sendMessage(msg.chat.id, "⚠️ Usage: /add_dev <address>");
          }
          break;
        case '/remove_dev':
          if (parts.length > 1) {
            const match = [command, parts.slice(1).join(' ')];
            commandHandlers.removeDevWallet(bot, msg, match);
          } else {
            bot.sendMessage(msg.chat.id, "⚠️ Usage: /remove_dev <address>");
          }
          break;
        default:
          // Handle commands with parameters
          if (cmd === '/add' && parts.length > 1) {
            const match = [command, parts.slice(1).join(' ')];
            commandHandlers.addWallet(bot, msg, match);
          } else if (cmd === '/remove' && parts.length > 1) {
            const match = [command, parts.slice(1).join(' ')];
            commandHandlers.removeWallet(bot, msg, match);
          } else if (cmd === '/balance' && parts.length > 1) {
            const match = [command, parts.slice(1).join(' ')];
            commandHandlers.balance(bot, msg, match);
          } else if (cmd === '/transactions' && parts.length > 1) {
            const match = [command, parts.slice(1).join(' ')];
            commandHandlers.transactions(bot, msg, match);
          } else if (cmd === '/snipe_add' && parts.length > 1) {
            console.log('🎯 Executing /snipe_add handler');
            const match = [command, parts.slice(1).join(' ')];
            commandHandlers.snipeAdd(bot, msg, match);
          } else if (cmd === '/snipe_remove' && parts.length > 1) {
            const match = [command, parts.slice(1).join(' ')];
            commandHandlers.snipeRemove(bot, msg, match);
          } else {
            console.log(`❓ Unknown command: ${cmd}`);
            bot.sendMessage(msg.chat.id, `Unknown command: ${cmd}\\nUse /help to see available commands.`);
          }
          break;
      }

      console.log(`✅ Command ${cmd} executed successfully`);
    } catch (error) {
      console.error(`❌ Error executing command ${cmd}:`, error);
      bot.sendMessage(msg.chat.id, `❌ Error executing command: ${error.message}`);
    }
  });

  // Handle callback queries (button presses)
  bot.on('callback_query', async (callbackQuery) => {
    console.log(`🔘 Callback query received: "${callbackQuery.data}" from chat ${callbackQuery.message.chat.id}`);

    try {
      await bot.answerCallbackQuery(callbackQuery.id);
      console.log(`✅ Answered callback query: ${callbackQuery.data}`);

      await commandHandlers.handleMenuCallback(bot, callbackQuery);
      console.log(`✅ Handled callback query: ${callbackQuery.data}`);
    } catch (error) {
      console.error(`❌ Error handling callback query "${callbackQuery.data}":`, error.message);

      // Try to answer the callback query to prevent timeout
      try {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Error processing request' });
      } catch (answerError) {
        console.error('Failed to answer callback query:', answerError.message);
      }
    }
  });


  // Check if we have a stored chat ID and auto-send start message
  try {
    const chatIdConfig = await BotConfig.findOne({ setting: "chatId" });
    if (chatIdConfig && chatIdConfig.value) {
      console.log(`Found stored chat ID: ${chatIdConfig.value}`);

      // Auto-send start message
      setTimeout(async () => {
        try {
          await commandHandlers.start(bot, {
            chat: { id: chatIdConfig.value },
            from: { first_name: "User" }
          });
          console.log("✅ Auto-sent start message");
        } catch (error) {
          console.error("❌ Error sending auto-start message:", error);
        }
      }, 2000); // Wait 2 seconds for bot to fully initialize
    } else {
      console.log(
        "No chat ID found in database. Please run /start or /setchatid to set one."
      );
    }
  } catch (error) {
    console.error("Error checking for stored chat ID:", error);
  }

  // Add error handling for the bot
  bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
  });

  bot.on('error', (error) => {
    console.error('Bot error:', error.message);
  });

  console.log("Telegram bot initialized and listening...");
  return bot;
};

// Manual polling implementation
let pollingOffset = 0;

const startManualPolling = async () => {
  console.log("🔄 Starting manual polling...");

  const poll = async () => {
    try {
      const updates = await bot.getUpdates({
        offset: pollingOffset,
        timeout: 5,
        limit: 50
      });

      for (const update of updates) {
        pollingOffset = update.update_id + 1;

        if (update.message) {
          // Emit message event manually
          bot.emit('message', update.message);
        }

        if (update.callback_query) {
          // Emit callback_query event manually
          bot.emit('callback_query', update.callback_query);
        }
      }
    } catch (error) {
      console.error("❌ Polling error:", error.message);
    }

    // Continue polling
    setTimeout(poll, 1000);
  };

  poll();
};

// Get active chat ID from database
const getActiveChatId = async () => {
  try {
    const chatIdConfig = await BotConfig.findOne({ setting: "chatId" });
    if (chatIdConfig && chatIdConfig.value) {
      return chatIdConfig.value;
    }

    // Fallback to env variable
    if (process.env.ADMIN_CHAT_ID) {
      return process.env.ADMIN_CHAT_ID;
    }

    return null;
  } catch (error) {
    console.error("Error getting active chat ID:", error);
    return process.env.ADMIN_CHAT_ID || null;
  }
};

module.exports = {
  initBot,
  getBot: () => bot,
  getActiveChatId,
};
