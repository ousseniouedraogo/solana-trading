// Manual bot using direct API calls
require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");
const SnipeTarget = require("./src/db/models/snipeTargets");

// Import db connection
const connectDB = require("./src/db/index");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = 451811258;

console.log("🤖 Starting manual command processor...");

// Set bot commands for native Telegram menu
async function setBotCommands() {
  try {
    const commands = [
      { command: "start", description: "🚀 Start the bot and show main menu" },
      { command: "snipe_add", description: "🎯 Add new snipe target" },
      { command: "snipe_list", description: "📋 View active snipe targets" },
      { command: "snipe_stats", description: "📊 View sniping statistics" },
      { command: "snipe_remove", description: "🗑️ Remove snipe target" },
      { command: "help", description: "❓ Show help and commands" }
    ];

    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
      commands: commands
    });

    if (response.data.ok) {
      console.log("✅ Bot commands menu set successfully");
    } else {
      console.error("❌ Failed to set bot commands:", response.data);
    }
  } catch (error) {
    console.error("❌ Error setting bot commands:", error.message);
  }
}


// Send message function with optional keyboard
async function sendMessage(text, parseMode = 'Markdown', keyboard = null) {
  try {
    const messageData = {
      chat_id: CHAT_ID,
      text: text,
      parse_mode: parseMode
    };

    if (keyboard) {
      messageData.reply_markup = keyboard;
    }

    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, messageData);
    console.log(`✅ Sent: ${text.substring(0, 50)}...`);
    return response.data;
  } catch (error) {
    console.error("❌ Error sending message:", error.response?.data || error.message);
  }
}

// Create main menu keyboard
function getMainMenuKeyboard() {
  return {
    keyboard: [
      [
        { text: "🎯 Add Target" },
        { text: "📋 View Targets" }
      ],
      [
        { text: "📊 Statistics" },
        { text: "❓ Help" }
      ]
    ],
    resize_keyboard: true,
    persistent: true,
    one_time_keyboard: false
  };
}

// Create inline keyboard for quick actions
function getInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🎯 Quick Add", callback_data: "quick_add" },
        { text: "📋 List Targets", callback_data: "list_targets" }
      ],
      [
        { text: "📊 Stats", callback_data: "show_stats" },
        { text: "🔄 Refresh", callback_data: "refresh_menu" }
      ]
    ]
  };
}

// Process command function
async function processCommand(command, userId) {
  console.log(`🎯 Processing: ${command}`);

  try {
    if (command === "/start" || command === "🚀 Start" || command === "🔄 Refresh") {
      const welcomeMessage = `🎯 *Solana Sniping Bot*

*Welcome to automated token sniping!*

🚀 **Quick Actions:**
• Use buttons below for easy navigation
• Type commands or click menu (/) for full list
• Bot monitors Solana for new opportunities 24/7

*Popular Commands:*
• \`/snipe_add <token> <amount>\` - Add target
• \`/snipe_list\` - View targets
• \`/snipe_stats\` - Statistics

*Example:*
\`/snipe_add EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.001\``;

      await sendMessage(welcomeMessage, 'Markdown', getMainMenuKeyboard());

      // Also send inline keyboard for quick actions
      await sendMessage("🔧 *Quick Actions Panel*", 'Markdown', getInlineKeyboard());

    } else if (command === "/help") {
      await sendMessage(`🆘 *Sniping Bot Help*

*Commands:*
• \`/snipe_add <token> <amount>\` - Add target
• \`/snipe_list\` - List targets
• \`/snipe_remove <token>\` - Remove target

*Examples:*
\`/snipe_add So11111111111111111111111111111111111111112 0.001\`
\`/snipe_add EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.005\`

*How it works:*
1. Add tokens you want to snipe
2. Bot monitors Solana for new liquidity
3. Executes trades automatically when conditions are met
4. Get instant notifications of results`);

    } else if (command.startsWith("/snipe_add")) {
      const parts = command.split(" ");

      if (parts.length < 3) {
        await sendMessage("❌ *Invalid Format*\n\nUse: `/snipe_add <token_address> <sol_amount>`\n\nExample:\n`/snipe_add So11111111111111111111111111111111111111112 0.001`");
        return;
      }

      const tokenAddress = parts[1];
      const amount = parseFloat(parts[2]);

      if (isNaN(amount) || amount < 0.001) {
        await sendMessage("❌ *Invalid Amount*\n\nMinimum amount is 0.001 SOL");
        return;
      }

      if (tokenAddress.length < 40) {
        await sendMessage("❌ *Invalid Token Address*\n\nToken address must be a valid Solana address (44 characters)");
        return;
      }

      // Check if target already exists
      const existing = await SnipeTarget.findOne({
        userId: userId,
        tokenAddress: tokenAddress,
        isActive: true
      });

      if (existing) {
        await sendMessage(`⚠️ *Target Already Exists*\n\nYou already have an active target for this token:\n• Amount: ${existing.targetAmount} SOL\n• Slippage: ${existing.maxSlippage}%\n\nUse \`/snipe_remove ${tokenAddress}\` to remove it first.`);
        return;
      }

      // Create snipe target
      const target = new SnipeTarget({
        userId: userId,
        tokenAddress: tokenAddress,
        targetAmount: amount,
        maxSlippage: 15.0,
        isActive: true,
        snipeStatus: "pending",
        autoSell: {
          enabled: true,
          takeProfitPercent: 100,
          stopLossPercent: 50
        }
      });

      await target.save();

      await sendMessage(`✅ *Snipe Target Added Successfully!*

🎯 **Token:** \`${tokenAddress}\`
💰 **Amount:** ${amount} SOL
📊 **Max Slippage:** 15%
⚡ **Priority Fee:** 0.01 SOL
🔄 **Status:** Monitoring for liquidity...

The bot will automatically execute when conditions are met and notify you of the results.`);

    } else if (command === "/snipe_list") {
      console.log(`📋 Fetching snipe targets for user ${userId}`);

      const targets = await SnipeTarget.find({
        userId: userId,
        isActive: true
      }).sort({ createdAt: -1 });

      console.log(`Found ${targets.length} active targets`);

      if (targets.length === 0) {
        await sendMessage("📋 *No Active Snipe Targets*\n\nUse `/snipe_add <token> <amount>` to create your first target.\n\nExample:\n`/snipe_add So11111111111111111111111111111111111111112 0.001`");
        return;
      }

      let message = `📋 *Active Snipe Targets (${targets.length})*\n\n`;

      targets.forEach((target, index) => {
        const shortAddress = `${target.tokenAddress.substring(0, 8)}...${target.tokenAddress.substring(target.tokenAddress.length - 8)}`;
        message += `**${index + 1}.** \`${shortAddress}\`\n`;
        message += `   💰 ${target.targetAmount} SOL\n`;
        message += `   📊 ${target.maxSlippage}% slippage\n`;
        message += `   🔄 ${target.snipeStatus}\n`;
        message += `   📅 ${target.createdAt.toLocaleDateString()}\n\n`;
      });

      message += `*Commands:*\n• \`/snipe_add <token> <amount>\` - Add target\n• \`/snipe_remove <token>\` - Remove target`;

      console.log("📤 Sending snipe list message");
      await sendMessage(message);

    } else if (command === "/snipe_stats") {
      console.log(`📊 Fetching stats for user ${userId}`);

      const totalTargets = await SnipeTarget.countDocuments({ userId: userId });
      const activeTargets = await SnipeTarget.countDocuments({ userId: userId, isActive: true });
      const executedTargets = await SnipeTarget.countDocuments({ userId: userId, snipeStatus: "executed" });

      console.log(`Stats: Total=${totalTargets}, Active=${activeTargets}, Executed=${executedTargets}`);

      await sendMessage(`📊 *Sniping Statistics*

🎯 **Total Targets Created:** ${totalTargets}
⚡ **Currently Active:** ${activeTargets}
✅ **Successfully Executed:** ${executedTargets}
📈 **Success Rate:** ${totalTargets > 0 ? Math.round((executedTargets / totalTargets) * 100) : 0}%

*Recent Activity:* Bot is monitoring Solana for new liquidity opportunities.`);

      console.log("📤 Sent stats message");

      // Handle keyboard button presses
    } else if (command === "🎯 Add Target") {
      await sendMessage(`🎯 *Add Snipe Target*

*Format:* \`/snipe_add <token_address> <sol_amount>\`

*Examples:*
• \`/snipe_add So11111111111111111111111111111111111111112 0.001\`
• \`/snipe_add EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.005\`

*Requirements:*
• Minimum amount: 0.001 SOL
• Valid Solana token address (44 characters)
• Sufficient SOL balance for transaction`);

    } else if (command === "📋 View Targets") {
      await processCommand("/snipe_list", userId);

    } else if (command === "📊 Statistics") {
      await processCommand("/snipe_stats", userId);

    } else if (command === "❓ Help") {
      await processCommand("/help", userId);

    } else if (command.startsWith("/snipe_remove")) {
      const parts = command.split(" ");

      if (parts.length < 2) {
        await sendMessage("❌ *Invalid Format*\n\nUse: `/snipe_remove <token_address>`\n\nExample:\n`/snipe_remove EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`");
        return;
      }

      const tokenAddress = parts[1];

      console.log(`🗑️ Removing snipe target: ${tokenAddress} for user ${userId}`);

      const result = await SnipeTarget.findOneAndUpdate(
        {
          userId: userId,
          tokenAddress: tokenAddress,
          isActive: true
        },
        {
          isActive: false,
          snipeStatus: "cancelled"
        },
        { new: true }
      );

      if (!result) {
        await sendMessage(`❌ *Target Not Found*\n\nNo active snipe target found for:\n\`${tokenAddress}\`\n\nUse \`/snipe_list\` to see your active targets.`);
        return;
      }

      await sendMessage(`✅ *Snipe Target Removed*\n\n🗑️ **Token:** \`${tokenAddress}\`\n💰 **Amount:** ${result.targetAmount} SOL\n🔄 **Status:** Cancelled\n\nTarget has been deactivated and will no longer be monitored.`);

      console.log(`✅ Removed snipe target: ${result._id}`);

    } else {
      await sendMessage(`❓ *Unknown Command*\n\nAvailable commands:\n• \`/start\` - Main menu\n• \`/snipe_add <token> <amount>\` - Add target\n• \`/snipe_list\` - List targets\n• \`/snipe_stats\` - Statistics\n• \`/help\` - Help`);
    }

  } catch (error) {
    console.error(`❌ Error processing ${command}:`, error);
    await sendMessage(`❌ *Error Processing Command*\n\n${error.message}`);
  }
}

// Process callback queries (inline button presses)
async function processCallbackQuery(callbackQuery) {
  const userId = callbackQuery.from.id.toString();
  const data = callbackQuery.data;

  console.log(`🔘 Callback: ${data} from user ${userId}`);

  try {
    // Answer the callback query first to remove loading state
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      callback_query_id: callbackQuery.id
    });

    switch (data) {
      case "quick_add":
        await sendMessage(`🎯 *Quick Add Snipe Target*

*Popular Tokens:*
• USDC: \`/snipe_add EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.001\`
• SOL: \`/snipe_add So11111111111111111111111111111111111111112 0.001\`

*Custom Format:*
\`/snipe_add <token_address> <sol_amount>\`

Minimum: 0.001 SOL`);
        break;

      case "list_targets":
        await processCommand("/snipe_list", userId);
        break;

      case "show_stats":
        await processCommand("/snipe_stats", userId);
        break;

      case "refresh_menu":
        await processCommand("/start", userId);
        break;

      default:
        console.log(`Unknown callback: ${data}`);
    }
  } catch (error) {
    console.error(`❌ Error processing callback ${data}:`, error);
  }
}

// Main processing loop
async function processUpdates() {
  // Connect to database first
  const connected = await connectDB();
  if (!connected) {
    console.error("❌ Failed to connect to database. Bot cannot start.");
    process.exit(1);
  }

  let offset = 0;

  // Set bot commands for native Telegram menu
  await setBotCommands();

  // Auto-start the bot for the user
  console.log("🚀 Auto-starting bot for user...");
  await processCommand("/start", CHAT_ID.toString());

  console.log("🔄 Starting message polling...");

  while (true) {
    try {
      const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`, {
        params: { offset, timeout: 5 }
      });

      const updates = response.data.result;

      for (const update of updates) {
        offset = update.update_id + 1;

        // Handle text messages
        if (update.message && update.message.text) {
          const msg = update.message;
          const command = msg.text.trim();
          const userId = msg.from.id.toString();

          console.log(`📨 Received: "${command}" from ${msg.from.first_name}`);

          // Handle both slash commands and keyboard button presses
          if (command.startsWith("/") ||
            command === "🎯 Add Target" ||
            command === "📋 View Targets" ||
            command === "📊 Statistics" ||
            command === "❓ Help") {
            await processCommand(command, userId);
          }
        }

        // Handle callback queries (inline button presses)
        if (update.callback_query) {
          await processCallbackQuery(update.callback_query);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error("❌ Error in processing loop:", error.message);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

processUpdates().catch(console.error);