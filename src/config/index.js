// src/config/index.js
require("dotenv").config();

const config = {
  mongodb: {
    uri:
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017/telegramCopyTradingBot",
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminId: process.env.TELEGRAM_ADMIN_ID || process.env.ADMIN_CHAT_ID,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
  apiKeys: {
    moralis: process.env.MORALIS_API_KEY,
    inch: process.env.INCH_API_KEY,
  },
  wallets: {
    evm: process.env.EVM_PRIVATE_KEY,
    solana: process.env.SOLANA_PRIVATE_KEY,
  },
  polling: {
    newSwapFreq: parseInt(process.env.NEW_SWAP_POLLING_FREQ) || 60000,
    swapProcessingFreq: parseInt(process.env.SWAP_PROCESSING_FREQ) || 30000,
  },
  cleanup: {
    frequency: parseInt(process.env.CLEANUP_FREQ) || 3600000,
    hoursThreshold: parseInt(process.env.CLEANUP_HOURS_THRESHOLD) || 24,
  },
};

// Validate required configuration
const validateConfig = () => {
  const missing = [];

  if (!config.telegram.token) {
    missing.push("Telegram Bot Token (telegram.token)");
  }
  if (!config.apiKeys.moralis) {
    missing.push("Moralis API Key (apiKeys.moralis)");
  }

  // Require at least Solana private key
  if (!config.wallets.solana) {
    missing.push("Solana Private Key (wallets.solana)");
  }

  // 1inch and EVM are optional but we warn if one is provided without the other
  if (config.wallets.evm && !config.apiKeys.inch) {
    console.warn(
      "⚠️  EVM Private Key provided but 1inch API Key is missing. EVM swaps may fail."
    );
  }

  if (missing.length > 0) {
    console.error("Missing required configuration:");
    missing.forEach((item) => {
      console.error(`- ${item}`);
    });
    return false;
  }

  return true;
};

config.isValid = validateConfig();

module.exports = config;
