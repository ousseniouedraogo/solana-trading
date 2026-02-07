// Minimal working sniping bot test
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const SnipeTarget = require("./src/db/models/snipeTargets");

console.log("🤖 Starting minimal sniping bot test...");

// Connect to database
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB error:", err));

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
  polling: true 
});

console.log("🚀 Bot initialized");

// Simple message handler for sniping commands
bot.on("message", async (msg) => {
  if (!msg.text || !msg.text.startsWith("/")) return;
  
  const chatId = msg.chat.id;
  const userId = chatId.toString();
  console.log(`📨 Command: "${msg.text}" from ${userId}`);
  
  try {
    if (msg.text === "/start") {
      await bot.sendMessage(chatId, `
🎯 *Solana Sniping Bot*

*Commands:*
• \`/snipe_add <token> <sol_amount>\` - Add target
• \`/snipe_list\` - List targets  
• \`/test\` - Test connectivity

*Example:*
\`/snipe_add So11111111111111111111111111111111111111112 0.001\`
      `, { parse_mode: "Markdown" });
      
    } else if (msg.text === "/test") {
      await bot.sendMessage(chatId, "✅ Bot is working! Try /snipe_add command.");
      
    } else if (msg.text.startsWith("/snipe_add")) {
      const parts = msg.text.split(" ");
      
      if (parts.length < 3) {
        await bot.sendMessage(chatId, "❌ Format: /snipe_add <token_address> <sol_amount>");
        return;
      }
      
      const tokenAddress = parts[1];
      const amount = parseFloat(parts[2]);
      
      if (isNaN(amount) || amount < 0.001) {
        await bot.sendMessage(chatId, "❌ Amount must be at least 0.001 SOL");
        return;
      }
      
      console.log(`🎯 Creating snipe target: ${tokenAddress}, ${amount} SOL`);
      
      // Create snipe target
      const target = new SnipeTarget({
        userId: userId,
        tokenAddress: tokenAddress,
        targetAmount: amount,
        maxSlippage: 15.0,
        isActive: true,
        snipeStatus: "pending"
      });
      
      await target.save();
      console.log(`✅ Snipe target saved: ${target._id}`);
      
      await bot.sendMessage(chatId, `✅ *Snipe Target Added*

🎯 Token: \`${tokenAddress}\`
💰 Amount: ${amount} SOL
📊 Slippage: 15%
🔍 Status: Monitoring for opportunities...`, { parse_mode: "Markdown" });
      
    } else if (msg.text === "/snipe_list") {
      console.log(`📋 Listing targets for user ${userId}`);
      
      const targets = await SnipeTarget.find({ 
        userId: userId, 
        isActive: true 
      }).sort({ createdAt: -1 });
      
      if (targets.length === 0) {
        await bot.sendMessage(chatId, "📋 No active snipe targets found.");
        return;
      }
      
      let message = `📋 *Active Snipe Targets (${targets.length})*\n\n`;
      
      targets.forEach((target, index) => {
        message += `${index + 1}. **${target.tokenAddress.substring(0, 20)}...**\n`;
        message += `   💰 ${target.targetAmount} SOL\n`;
        message += `   📊 ${target.maxSlippage}% slippage\n`;
        message += `   🔄 ${target.snipeStatus}\n\n`;
      });
      
      await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
      
    } else {
      await bot.sendMessage(chatId, `❓ Unknown command. Try:
• /start - Show menu
• /test - Test bot
• /snipe_add <token> <amount> - Add target
• /snipe_list - List targets`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${msg.text}:`, error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

bot.on("polling_error", (error) => {
  console.error("❌ Polling error:", error.message);
});

console.log("🎯 Send /start to begin testing...");