// src/index.js
const config = require("./config");
const connectDB = require("./db");
const { initBot } = require("./telegram");
const { startSwapFetcher } = require("./services/polling/swapFetcher");
const { startSwapProcessor } = require("./services/polling/swapProcessor");
const { startCleanupService } = require("./services/cleanup");
const TokenMonitor = require("./services/sniping/tokenMonitor");

async function startBot() {
  try {
    // Check if configuration is valid
    if (!config.isValid) {
      console.error("Invalid configuration. Please check your .env file.");
      process.exit(1);
    }

    console.log("Starting Telegram Copy Trading Bot...");

    // Connect to MongoDB
    await connectDB();

    // Initialize Telegram bot
    const bot = initBot();

    // Start services
    await startSwapFetcher();
    await startSwapProcessor();
    await startCleanupService();

    // Initialize and start sniping token monitor (with error handling)
    try {
      console.log("🎯 Initializing Solana Sniping Bot...");
      const tokenMonitor = new TokenMonitor();
      await tokenMonitor.initialize();
      console.log("✅ Sniping Bot initialized successfully!");
    } catch (snipingError) {
      console.warn("⚠️  Sniping Bot initialization failed, but continuing with basic functionality:", snipingError.message);
    }
    
    console.log("✅ All services started successfully!");
    console.log("🤖 Bot is ready to accept commands!");

    // Handle application shutdown
    process.on("SIGINT", async () => {
      console.log("Shutting down application...");
      process.exit(0);
    });
  } catch (error) {
    console.error("Error starting the bot:", error);
    process.exit(1);
  }
}

// Start the application
startBot();
