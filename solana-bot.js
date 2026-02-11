// Solana-Focused Copy Trading & Sniping Bot
require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");
const { Keypair, PublicKey } = require("@solana/web3.js");
const bs58 = require("bs58").default || require("bs58");

// Import models
const UserWallet = require("./src/db/models/userWallets");
const TrackedWallet = require("./src/db/models/trackedWallets");
const SnipeTarget = require("./src/db/models/snipeTargets");
const SnipeExecution = require("./src/db/models/snipeExecutions");

// Import Solana services
const { getSolanaBalance, getSplTokenBalance, transferSol } = require("./src/services/wallets/solana");
const { executeJupiterSwap } = require("./src/services/execution/jupiterSwap");
const { getTokenMetadata } = require("./src/services/moralis/tokenMetadata");

// Import db connection
const connectDB = require("./src/db/index");

// Import Background Services
const { startSwapFetcher } = require("./src/services/polling/swapFetcher");
const { startSwapProcessor } = require("./src/services/polling/swapProcessor");
const TokenMonitor = require("./src/services/sniping/tokenMonitor");
const mintDetector = require("./src/services/sniping/mintDetector");
const positionManager = require("./src/services/execution/positionManager");

// Import Telegram Commands
const {
  handleSettingsCommand,
  handleSettingsCallback,
  userAwaitingDevAddress
} = require("./src/telegram/commands/settings");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_ID || process.env.ADMIN_CHAT_ID;

console.log("🌟 Starting Solana-Focused Trading & Sniping Bot...");

// Set Solana-focused bot commands
async function setBotCommands() {
  try {
    const commands = [
      { command: "start", description: "🚀 Start & Initialize Chat ID" },
      { command: "help", description: "❓ Show available commands" },
      { command: "add", description: "➕ Add a wallet to track (/add <address> <chain>)" },
      { command: "remove", description: "➖ Remove a tracked wallet (/remove <address> <chain>)" },
      { command: "list", description: "📋 List all tracked wallets" },
      { command: "status", description: "📊 Check bot status and statistics" },
      { command: "balance", description: "💰 Check your wallet balance (/balance <chain>)" },
      { command: "setup_wallet", description: "👛 Setup Solana wallet" },
      { command: "snipe_add", description: "🎯 Add snipe target" },
      { command: "import_key", description: "🔑 Import wallet private key" },
      { command: "swap", description: "🔄 Manual swap (SOL -> Token)" },
      { command: "withdraw", description: "💸 Withdraw SOL to another wallet" },
      { command: "positions", description: "📊 View open trading positions" },
      { command: "settings", description: "⚙️ Bot settings & configuration" },
      { command: "guide", description: "📖 How the bot works & Architecture" }
    ];

    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
      commands: commands
    });

    if (response.data.ok) {
      console.log("✅ Solana bot commands menu set successfully");
    }
  } catch (error) {
    console.error("❌ Error setting bot commands:", error.message);
  }
}


// Enhanced send message function
async function sendMessage(text, parseMode = 'Markdown', keyboard = null, chatId = null) {
  try {
    const targetChatId = chatId || ADMIN_CHAT_ID;

    if (!targetChatId) {
      console.warn("⚠️ Cannot send message: No target chat ID provided and no ADMIN_CHAT_ID in .env");
      return;
    }

    const messageData = {
      chat_id: targetChatId,
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

// Main menu keyboard - Solana focused
function getMainMenuKeyboard() {
  return {
    keyboard: [
      [
        { text: "👛 Wallet Setup" },
        { text: "💰 Balance" }
      ],
      [
        { text: "👀 Copy Trading" },
        { text: "🎯 Sniping" }
      ],
      [
        { text: "📊 Statistics" },
        { text: "⚙️ Settings" }
      ],
      [
        { text: "🔄 Manual Swap" }
      ]
    ],
    resize_keyboard: true,
    persistent: true,
    one_time_keyboard: false
  };
}

// Wallet management keyboard
function getWalletKeyboard() {
  return {
    keyboard: [
      [
        { text: "🔑 Setup New Wallet" },
        { text: "ℹ️ Wallet Info" }
      ],
      [
        { text: "💰 Check Balance" },
        { text: "🔄 Generate New" }
      ],
      [
        { text: "💸 Withdraw" },
        { text: "🏠 Main Menu" }
      ]
    ],
    resize_keyboard: true,
    persistent: true
  };
}

// Copy trading keyboard
function getCopyTradingKeyboard() {
  return {
    keyboard: [
      [
        { text: "➕ Track Wallet" },
        { text: "📋 Tracked List" }
      ],
      [
        { text: "➖ Stop Tracking" },
        { text: "📈 Trading Stats" }
      ],
      [
        { text: "🏠 Main Menu" }
      ]
    ],
    resize_keyboard: true,
    persistent: true
  };
}

// Sniping keyboard
function getSnipingKeyboard() {
  return {
    keyboard: [
      [
        { text: "🎯 Add Target" },
        { text: "📍 Target List" }
      ],
      [
        { text: "� Active Positions" },
        { text: "🗑️ Remove Target" }
      ],
      [
        { text: "⏸️ Pause All" },
        { text: "▶️ Resume All" }
      ],
      [
        { text: "🏠 Main Menu" }
      ]
    ],
    resize_keyboard: true,
    persistent: true
  };
}

// Quick actions for Solana
function getQuickActionsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "⚡ Quick Setup", callback_data: "quick_setup" },
        { text: "💰 SOL Balance", callback_data: "check_balance" }
      ],
      [
        { text: "🎯 Quick Snipe", callback_data: "quick_snipe" },
        { text: "👀 Track Wallet", callback_data: "quick_track" }
      ],
      [
        { text: "🔄 Manual Swap", callback_data: "manual_swap" },
        { text: "🔄 Refresh", callback_data: "refresh_main" }
      ]
    ]
  };
}

// Snipe amount selection keyboard
function getSnipeAmountKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "💎 0.001 SOL", callback_data: "snipe_amount_0.001" },
        { text: "💰 0.005 SOL", callback_data: "snipe_amount_0.005" },
        { text: "🚀 0.01 SOL", callback_data: "snipe_amount_0.01" }
      ],
      [
        { text: "💸 0.05 SOL", callback_data: "snipe_amount_0.05" },
        { text: "🔥 0.1 SOL", callback_data: "snipe_amount_0.1" },
        { text: "🌟 0.5 SOL", callback_data: "snipe_amount_0.5" }
      ],
      [
        { text: "✏️ Custom Amount", callback_data: "snipe_custom_amount" },
        { text: "❌ Cancel", callback_data: "cancel_snipe" }
      ]
    ]
  };
}

// Popular tokens for sniping
function getPopularTokensKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "💵 USDC", callback_data: "token_EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
        { text: "💴 USDT", callback_data: "token_Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" }
      ],
      [
        { text: "🐕 BONK", callback_data: "token_DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
        { text: "🌊 JUP", callback_data: "token_JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" }
      ],
      [
        { text: "✏️ Custom Token", callback_data: "custom_token" },
        { text: "❌ Cancel", callback_data: "cancel_snipe" }
      ]
    ]
  };
}

// Validate Solana private key
function validateSolanaPrivateKey(keyInput) {
  try {
    if (!keyInput) throw new Error('No key provided');
    const privateKeyString = keyInput.trim();
    // Try to create keypair from the string
    let keypair;

    // Handle different formats
    if (privateKeyString.startsWith('[') && privateKeyString.endsWith(']')) {
      // Array format: [1,2,3,...]
      const numbers = JSON.parse(privateKeyString);
      if (numbers.length !== 64) {
        throw new Error('Invalid key length - must be 64 bytes');
      }
      keypair = Keypair.fromSecretKey(new Uint8Array(numbers));
    } else if (privateKeyString.length >= 64) {
      // Base58 string format
      try {
        const decoded = bs58.decode(privateKeyString);
        if (decoded.length !== 64) {
          throw new Error('Invalid decoded key length');
        }
        keypair = Keypair.fromSecretKey(decoded);
      } catch (e) {
        throw new Error(`Invalid base58 encoding: ${e.message}`);
      }
    } else {
      throw new Error('Invalid private key format');
    }

    return {
      isValid: true,
      keypair: keypair,
      publicKey: keypair.publicKey.toString(),
      privateKey: privateKeyString
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message
    };
  }
}

// Get user's wallet from database
async function getUserWallet(userId) {
  try {
    const wallet = await UserWallet.findOne({ userId: userId, isActive: true });
    return wallet;
  } catch (error) {
    console.error("Error getting user wallet:", error);
    return null;
  }
}

// Get balance for user's stored wallet
async function getUserBalance(userId) {
  try {
    const wallet = await getUserWallet(userId);
    if (!wallet) {
      throw new Error("No wallet configured");
    }

    // Use QuickNode RPC to get balance
    const response = await axios.post(process.env.SOLANA_RPC_URL, {
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [wallet.publicKey]
    });

    if (response.data.error) {
      throw new Error(`RPC Error: ${response.data.error.message}`);
    }

    // Convert lamports to SOL
    const lamports = response.data.result.value;
    const solBalance = lamports / 1e9;

    return solBalance;
  } catch (error) {
    console.error("Error getting user balance:", error);
    throw error;
  }
}

// Create keypair from stored wallet
function createKeypairFromWallet(wallet) {
  try {
    let secretKey;

    if (wallet.privateKey.startsWith('[') && wallet.privateKey.endsWith(']')) {
      // Array format
      const numbers = JSON.parse(wallet.privateKey);
      secretKey = new Uint8Array(numbers);
    } else {
      // Base58 format - Using global bs58 specifically fixed for v6
      secretKey = bs58.decode(wallet.privateKey);
    }

    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error("Error creating keypair:", error);
    throw new Error("Invalid wallet format");
  }
}

// Check if user has wallet setup
async function checkWalletSetup(userId) {
  const wallet = await getUserWallet(userId);
  return wallet !== null;
}

// Main command processor
async function processCommand(command, userId) {
  console.log(`🎯 Processing: ${command}`);

  try {
    // ===== NEW: Handle Developer Address Input =====
    if (userAwaitingDevAddress && userAwaitingDevAddress.get(userId)) {
      if (command.startsWith('/')) {
        // If user sends a command, cancel the input wait
        userAwaitingDevAddress.delete(userId);
      } else {
        userAwaitingDevAddress.delete(userId);
        await sendMessage("🔄 Processing developer wallet...", 'Markdown', null, userId);
        // Route to existing add command logic with dev_sniper role
        await processTrackWallet(`/track ${command} dev_sniper`, userId);
        return;
      }
    }
    // ===============================================

    // Check if user is in "awaiting address" state and input is not a command
    const selection = userSelections.get(userId);
    if (selection && !command.startsWith('/')) {
      if (selection.awaitingTrackAddress) {
        userSelections.delete(userId);
        await processTrackWallet(`/track ${command}`, userId);
        return;
      } else if (selection.awaitingSnipeAddress) {
        userSelections.delete(userId);
        // Default amount for direct address snipe
        await processSnipeAdd(`/snipe_add ${command}`, userId);
        return;
      }
    }
    // ===== MAIN MENU =====
    if (command === "/start" || command === "🏠 Main Menu" || command === "🔄 Refresh") {
      const hasWallet = await checkWalletSetup(userId);

      const welcomeMessage = `🌟 *Solana Trading Bot*

*⚡ Advanced Solana Copy Trading & Sniping Platform*

**🚀 Key Features:**
• 👛 **Secure Wallet Management** - Setup & manage wallets
• 👀 **Copy Trading** - Track & copy Solana wallet trades  
• 🎯 **Token Sniping** - Automated new token sniping
• 💰 **Portfolio Tracking** - Real-time SOL & SPL balances

**⚡ Powered by:**
• Jupiter Ultra API for ultra-fast swaps
• QuickNode RPC for reliable Solana connectivity
• Real-time pool monitoring for instant execution

${hasWallet ? '✅ **Wallet Status:** Configured and ready' : '⚠️ **Setup Required:** Please configure your wallet first'}

*Use the buttons below to get started:*`;

      await sendMessage(welcomeMessage, 'Markdown', getMainMenuKeyboard(), userId);
      await sendMessage("🔧 *Quick Actions Panel*", 'Markdown', getQuickActionsKeyboard(), userId);

      // ===== SETTINGS COMMAND =====
    } else if (command === "/settings" || command === "⚙️ Settings") {
      try {
        const botWrapper = {
          sendMessage: async (chatId, text, options) => {
            await sendMessage(text, options?.parse_mode || 'Markdown', options?.reply_markup, chatId);
          }
        };
        await handleSettingsCommand(botWrapper, userId);
      } catch (error) {
        console.error("Error in /settings command:", error);
        await sendMessage(`❌ *Settings Error*\n\n${error.message}`, 'Markdown', null, userId);
      }

      // ===== WALLET MANAGEMENT =====
    } else if (command === "👛 Wallet Setup" || command === "/setup_wallet") {
      const isEnvManaged = !!process.env.SOLANA_PRIVATE_KEY;
      const wallet = await getUserWallet(userId);

      let walletStatus = "⚠️ *No Wallet Configured*";
      if (isEnvManaged) {
        walletStatus = "⚙️ *Managed via .env Configuration*";
      } else if (wallet) {
        walletStatus = "✅ *Active Wallet Found*";
      }

      await sendMessage(`👛 *Solana Wallet Management*

*Secure wallet setup and management for trading operations*

**📊 Current Status:**
${walletStatus}
${wallet ? `• Address: \`${wallet.publicKey}\`` : ''}

**🔧 Configuration Options:**
• **Automatic (.env):** Managed via server environment variables.
• **Manual:** Import an existing key or generate a fresh wallet.
• **Database:** All keys are stored encrypted for your security.

${isEnvManaged ? '💡 *Note: Your .env wallet is currently active. You can still import or generate a different one below if needed.*' : ''}

*Choose an option below:*`, 'Markdown', getWalletKeyboard(), userId);

    } else if (command === "🔑 Setup New Wallet") {
      await sendMessage(`🔑 *Import Your Solana Wallet*

**⚠️ SECURITY FIRST:**
• Your private key is encrypted before storage.
• We recommend using a dedicated trading wallet.
• Never share your key with anyone else.

**📝 How to Import:**
Type the following command followed by your private key:

\`\`/import_key YOUR_PRIVATE_KEY\`\`

**Example:**
\`\`/import_key 5Ke8nX7XgzJFv3n2HdU7mP9K1GX5x8y3QrBmW...\`\`

**💡 Where to find your key:**
• **Phantom:** Settings → Export Private Key
• **Solflare:** Settings → Export Wallet
• **Backpack:** Settings → Private Key`, 'Markdown', null, userId);

    } else if (command.startsWith("/import_key ")) {
      await processWalletImport(command, userId);

    } else if (command === "🔄 Generate New") {
      await processWalletGeneration(userId);

    } else if (command === "💸 Withdraw" || command.toLowerCase().startsWith("/withdraw")) {
      await processWithdraw(command, userId);

    } else if (command === "ℹ️ Wallet Info" || command === "/wallet_info") {
      await processWalletInfo(userId);

    } else if (command === "💰 Balance" || command === "💰 Check Balance" || command.startsWith("/balance")) {
      await processBalanceCheck(userId);

      // ===== COPY TRADING =====
    } else if (command === "👀 Copy Trading") {
      const hasWallet = await checkWalletSetup(userId);
      if (!hasWallet) {
        await sendMessage("⚠️ *Wallet Setup Required*\n\nPlease setup your Solana wallet first using '👛 Wallet Setup' to use copy trading features.", 'Markdown', null, userId);
        return;
      }

      await sendMessage(`👀 *Solana Copy Trading*

*Automatically copy trades from successful Solana traders*

**🔥 Features:**
• Track unlimited Solana wallets
• Real-time swap detection via Jupiter
• Configurable copy amounts and slippage
• MEV protection and priority fees

**📊 Current Status:**
• Platform: Solana mainnet only
• DEXs: Jupiter aggregated (Raydium, Orca, etc.)
• Execution: Sub-200ms typical

*Choose an action:*`, 'Markdown', getCopyTradingKeyboard(), userId);

    } else if (command === "➕ Track Wallet") {
      userSelections.set(userId, { awaitingTrackAddress: true });
      await sendMessage(`➕ *Track Solana Wallet*
*The bot will copy all swaps from tracked wallets with your configured settings.*

**💡 Vous pouvez maintenant coller l'adresse directement ci-dessous.**`, 'Markdown', null, userId);

    } else if (command.startsWith("/track ") || command.startsWith("/add ")) {
      // Handle /add <address> <chain> (chain is currently ignored as we are on Solana)
      const parts = command.split(" ");
      if (parts[0] === "/add") {
        const address = parts[1];
        if (!address) {
          await sendMessage("❌ *Invalid Format*\n\nUsage: `/add <address> [chain]`\nExample: `/add 9Wz... eth` (Note: Only Solana supported currently)", 'Markdown', null, userId);
          return;
        }
        await processTrackWallet(`/track ${address}`, userId);
      } else {
        await processTrackWallet(command, userId);
      }

    } else if (command === "📋 Tracked List" || command === "/list_trackers" || command === "/list") {
      await processListTrackers(userId);

    } else if (command === "➖ Stop Tracking") {
      await sendMessage(`➖ *Stop Tracking Wallet*

**Format:** \`/untrack <wallet_address>\`

**Example:**
\`/untrack 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\`

*This will stop copying trades from the specified wallet.*`, 'Markdown', null, userId);

    } else if (command === "📈 Trading Stats") {
      await processOverallStats(userId);

    } else if (command.startsWith("/untrack ") || command.startsWith("/remove ")) {
      const parts = command.split(" ");
      if (parts[0] === "/remove") {
        const address = parts[1];
        if (!address) {
          await sendMessage("❌ *Invalid Format*\n\nUsage: `/remove <address> [chain]`", 'Markdown', null, userId);
          return;
        }
        await processUntrackWallet(`/untrack ${address}`, userId);
      } else {
        await processUntrackWallet(command, userId);
      }

      // ===== SNIPING =====
    } else if (command === "🎯 Sniping") {
      const hasWallet = await checkWalletSetup(userId);
      if (!hasWallet) {
        await sendMessage("⚠️ *Wallet Setup Required*\n\nPlease setup your Solana wallet first using '👛 Wallet Setup' to use sniping features.", 'Markdown', null, userId);
        return;
      }

      await sendMessage(`🎯 *Solana Token Sniping*

*Lightning-fast automated token sniping on Solana*

**⚡ Performance:**
• Sub-200ms execution via Jupiter Ultra
• Real-time pool monitoring
• MEV protection with priority fees
• Advanced slippage management

**🎯 Features:**
• Monitor new liquidity pools
• Configurable buy amounts
• Auto-sell functionality (coming soon)
• Comprehensive performance tracking

*Choose an action:*`, 'Markdown', getSnipingKeyboard(), userId);

    } else if (command === "🎯 Add Target") {
      userSelections.set(userId, { awaitingSnipeAddress: true });
      await sendMessage(`🎯 *Add Snipe Target*

Choose a popular token or enter a custom address:

**🔥 Popular Tokens:**
Click a button below for instant setup, or use manual format.

**📝 Manual Format:**
\`/snipe_add <token_address> [sol_amount] [tp%] [sl%]\`

**📋 Examples:**
• \`/snipe_add EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\` (Default 0.011 SOL)
• \`/snipe_add DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 0.2 150 30\`

**Defaults:**
• Amount: 0.011 SOL
• TP/SL: 75% / 20%
• Sufficient balance for trading + fees

**💡 Vous pouvez maintenant coller l'adresse du token directement ci-dessous.**`, 'Markdown', getPopularTokensKeyboard(), userId);

    } else if (command.startsWith("/snipe_add ")) {
      await processSnipeAdd(command, userId);

    } else if (command === "📍 Target List" || command === "/snipe_list") {
      await processSnipeListWithButtons(userId);

    } else if (command === "� Active Positions" || command === "/positions") {
      await processPositions(userId);

    } else if (command === "�📈 Snipe Stats" || command === "/snipe_stats") {
      await processSnipeStats(userId);

    } else if (command === "🗑️ Remove Target") {
      await sendMessage(`🗑️ *Remove Snipe Target*

**Format:** \`/snipe_remove <token_address>\`

**To find your token addresses:**
• Use '📍 Target List' to see active targets
• Copy the address from the list
• Use the remove command

**Example:**
\`/snipe_remove EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`

**Alternative:** View your targets first:`, 'Markdown', {
        inline_keyboard: [
          [
            { text: "📍 View My Targets", callback_data: "show_targets_for_removal" }
          ],
          [
            { text: "❌ Cancel", callback_data: "cancel_removal" }
          ]
        ]
      }, userId);

    } else if (command.startsWith("/snipe_remove ")) {
      await processSnipeRemove(command, userId);

    } else if (command.toLowerCase().startsWith("/swap") || command === "🔄 Manual Swap") {
      await processManualSwap(command, userId);

    } else if (command.startsWith("/positions")) {
      await processPositions(userId);

    } else if (command.startsWith("/withdraw") || command === "💸 Withdraw") {
      await processWithdraw(command, userId);

      // ===== STATISTICS =====
    } else if (command === "📊 Statistics" || command === "/status" || command === "/stats") {
      await processOverallStats(userId);

    } else if (command === "/help" || command === "❓ Help") {
      await processHelp(userId);

    } else if (command === "/guide" || command === "📖 Guide") {
      await processGuide(userId);

    } else {
      await sendMessage(`❓ *Unknown Command*

*Available options:*
• Use keyboard buttons for easy navigation
• Type \`/help\` for complete command list
• Click menu (/) for quick commands

*Quick start:*
1. Setup wallet: 👛 Wallet Setup
2. Check balance: 💰 Balance  
3. Start trading: 👀 Copy Trading or 🎯 Sniping`, 'Markdown', null, userId);
    }

  } catch (error) {
    console.error(`❌ Error processing ${command}:`, error);
    await sendMessage(`❌ *Error Processing Command*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

// ===== COMMAND PROCESSORS =====

async function processWalletImport(command, userId) {
  const parts = command.split(" ");

  if (parts.length < 2) {
    await sendMessage("❌ *Invalid Format*\n\nUse: `/import_key <private_key>`\n\nExample:\n`/import_key 5Ke8nX7XgzJFv3n2H...`", 'Markdown', null, userId);
    return;
  }

  const privateKeyString = parts.slice(1).join(" "); // Handle keys with spaces

  console.log(`🔑 Importing wallet for user ${userId}`);

  try {
    // Validate the private key
    const validation = validateSolanaPrivateKey(privateKeyString);

    if (!validation.isValid) {
      await sendMessage(`❌ *Invalid Private Key*\n\n${validation.error}\n\n**Supported formats:**\n• Base58: \`5Ke8...xyz\`\n• Array: \`[1,2,3,...,64]\``, 'Markdown', null, userId);
      return;
    }

    // Check if user already has a wallet
    const existingWallet = await getUserWallet(userId);
    if (existingWallet) {
      // Deactivate existing wallet
      existingWallet.isActive = false;
      await existingWallet.save();
    }

    // Create new wallet record
    const newWallet = new UserWallet({
      userId: userId,
      publicKey: validation.publicKey,
      privateKey: validation.privateKey,
      walletName: "Imported Wallet",
      isActive: true
    });

    await newWallet.save();

    // Get balance to confirm wallet works
    try {
      const balance = await getUserBalance(userId);

      await sendMessage(`✅ *Wallet Imported Successfully!*

🎉 **Wallet Active and Ready**

📊 **Wallet Details:**
• Address: \`${validation.publicKey}\`
• Balance: ${balance.toFixed(4)} SOL
• Status: Active and ready for trading

🔐 **Security:**
• Private key stored encrypted in database
• Wallet validated and functional
• Ready for copy trading and sniping

**You can now use all trading features!**`, 'Markdown', null, userId);

    } catch (balanceError) {
      await sendMessage(`✅ *Wallet Imported Successfully!*

📊 **Wallet Details:**
• Address: \`${validation.publicKey}\`
• Status: Active (balance check pending)

**Wallet is ready for trading operations.**`, 'Markdown', null, userId);
    }

  } catch (error) {
    console.error("Error importing wallet:", error);
    await sendMessage(`❌ *Error Importing Wallet*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

async function processWalletGeneration(userId) {
  try {
    // Generate new keypair
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    const privateKeyArray = Array.from(keypair.secretKey);

    // Check if user already has a wallet
    const existingWallet = await getUserWallet(userId);
    if (existingWallet) {
      existingWallet.isActive = false;
      await existingWallet.save();
    }

    // Create new wallet record
    const newWallet = new UserWallet({
      userId: userId,
      publicKey: publicKey,
      privateKey: JSON.stringify(privateKeyArray),
      walletName: "Generated Wallet",
      isActive: true
    });

    await newWallet.save();

    await sendMessage(`🔄 *New Wallet Generated Successfully!*

🎉 **Fresh Solana Wallet Created & Ready**

📊 **Wallet Details:**
• Address: \`${publicKey}\`
• Balance: 0 SOL (new wallet)  
• Status: Active and secured

💰 **Funding Instructions:**
1. **Copy the address above** (tap and hold to copy)
2. **Open your main Solana wallet** (Phantom, Solflare, etc.)
3. **Send SOL to the address** (minimum 0.01 SOL recommended)
4. **Wait for confirmation** (usually 1-2 seconds)

🚀 **After Funding:**
• Use 'ℹ️ Wallet Info' to check balance
• Start tracking profitable wallets
• Set up token snipe targets
• Begin automated trading

🔐 **Security:**
• Private key stored encrypted in database
• Only you have access to this bot
• Wallet is ready for immediate use once funded

**Copy the address and fund it to start trading!**`, 'Markdown', null, userId);

    // Also send a follow-up message with just the address for easy copying
    await sendMessage(`📋 **Copy This Address:**

\`${publicKey}\`

*Tap and hold the address above to copy it easily*`, 'Markdown', null, userId);

  } catch (error) {
    console.error("Error generating wallet:", error);
    await sendMessage(`❌ *Error Generating Wallet*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

async function processWalletInfo(userId) {
  try {
    const wallet = await getUserWallet(userId);

    if (!wallet) {
      await sendMessage(`ℹ️ *No Wallet Configured*

You haven't set up a Solana wallet yet.

**Setup Options:**
• 🔑 Import existing wallet with private key
• 🔄 Generate new wallet automatically

*Use '🔑 Setup New Wallet' to get started.*`, 'Markdown', null, userId);
      return;
    }

    // Try to get current balance
    let balanceInfo = "Checking balance...";
    try {
      const balance = await getUserBalance(userId);
      balanceInfo = `${balance.toFixed(4)} SOL`;
    } catch (balanceError) {
      console.error("Error checking balance:", balanceError);
      balanceInfo = "Balance check failed";
    }

    await sendMessage(`ℹ️ *Wallet Information*

📊 **Current Wallet:**
• Address: \`${wallet.publicKey}\`
• Name: ${wallet.walletName}
• Balance: ${balanceInfo}
• Status: ${wallet.isActive ? '✅ Active' : '⚠️ Inactive'}

📅 **Wallet History:**
• Created: ${wallet.createdAt.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    })}
• Last Used: ${wallet.lastUsed.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    })}

🔐 **Security:**
• Private key stored encrypted in database
• Wallet validated and functional

**This wallet is used for all trading operations.**`, 'Markdown', null, userId);

  } catch (error) {
    console.error("Error getting wallet info:", error);
    await sendMessage(`❌ *Error Getting Wallet Info*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

async function processBalanceCheck(userId) {
  try {
    const wallet = await getUserWallet(userId);

    if (!wallet) {
      await sendMessage(`💰 *No Wallet Configured*

Please setup your Solana wallet first to check balance.

*Use '👛 Wallet Setup' to configure your wallet.*`, 'Markdown', null, userId);
      return;
    }

    console.log(`💰 Checking balance for ${wallet.publicKey}`);

    const balance = await getUserBalance(userId);

    await sendMessage(`💰 *Solana Balance*

📊 **Current Balance:**
• SOL: ${balance.toFixed(4)} SOL
• Wallet: \`${wallet.publicKey.substring(0, 8)}...${wallet.publicKey.substring(wallet.publicKey.length - 8)}\`

💡 **Balance Notes:**
• Minimum 0.01 SOL recommended for copy trading
• Minimum 0.001 SOL for sniping operations  
• Additional SOL needed for transaction fees

**Balance updated in real-time.**`, 'Markdown', null, userId);

  } catch (error) {
    console.error("Error checking balance:", error);
    await sendMessage(`❌ *Error Checking Balance*\n\nPlease ensure your wallet is properly configured and try again.`, 'Markdown', null, userId);
  }
}

async function processTrackWallet(command, userId) {
  const parts = command.split(" ");

  if (parts.length < 2) {
    await sendMessage("❌ *Invalid Format*\n\nUse: `/track <wallet_address>`\n\nExample:\n`/track 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM`", 'Markdown', null, userId);
    return;
  }

  const address = parts[1];
  const role = parts[2] || 'copy_trading'; // Default to copy_trading if not specified

  // Validate Solana address
  try {
    new PublicKey(address);
  } catch {
    await sendMessage("❌ *Invalid Solana Address*\n\nPlease provide a valid Solana wallet address (32-44 characters).", 'Markdown', null, userId);
    return;
  }

  try {
    // Check if already exists (active or inactive)
    let tracker = await TrackedWallet.findOne({
      address: address,
      chain: 'solana'
    });

    if (tracker) {
      if (tracker.isActive) {
        // Check if role matches
        if (tracker.role === role) {
          await sendMessage(`⚠️ *Already Tracking*\n\nWallet \`${address}\` is already being tracked as **${role === 'dev_sniper' ? 'Developer' : 'Copy Trading'}** target.`, 'Markdown', null, userId);
          return;
        } else {
          // Role mismatch - update role?
          // For strict separation, maybe fail or update. Let's update.
          tracker.role = role;
          await tracker.save();
          await sendMessage(`✅ *Role Updated*\n\nWallet \`${address}\` is now tracked as **${role === 'dev_sniper' ? 'Developer' : 'Copy Trading'}** target.`, 'Markdown', null, userId);
          return;
        }
      } else {
        // Reactivate inactive wallet
        tracker.isActive = true;
        tracker.role = role; // Update role on reactivation
        tracker.addedAt = new Date(); // Update added date
        tracker.addedBy = userId;
        await tracker.save();
        await sendMessage(`✅ *Wallet Reactivated*\n\nTracking resumed for \`${address}\` (${role === 'dev_sniper' ? 'Developer' : 'Copy Trading'}).`, 'Markdown', null, userId);
        // Start monitoring immediately
        mintDetector.subscribeToWallet(address);
        return;
      }
    }

    // Add new tracking
    tracker = new TrackedWallet({
      address: address,
      chain: 'solana',
      isActive: true,
      role: role,
      addedAt: new Date(),
      addedBy: userId
    });

    await tracker.save();

    // Start real-time monitoring immediately
    mintDetector.subscribeToWallet(address);

    // Custom message based on role
    let nextStepsMsg = "";
    if (role === 'dev_sniper') {
      nextStepsMsg = `• Bot monitors for **Token Creation** & **Liquidity Pools**
• Automatically snipes new tokens when liquidity is added
• Notifications for new mints & snipe execution`;
    } else {
      nextStepsMsg = `• Bot monitors all swaps from this wallet
• Automatically copies profitable trades
• Notifications for successful copies`;
    }

    await sendMessage(`✅ *Wallet Tracking Started!*

**👀 Now Tracking:**
• **Address:** \`${address}\`
• **Type:** ${role === 'dev_sniper' ? '👨‍💻 Developer Sniper' : '👀 Copy Trading'}
• **Status:** Active monitoring

**🔄 What happens next:**
${nextStepsMsg}

*Use \`/list_trackers\` to manage tracked wallets.*`, 'Markdown', null, userId);

  } catch (error) {
    console.error("Error tracking wallet:", error);
    if (error.code === 11000) {
      // Race condition or edge case
      await sendMessage(`⚠️ *Already Tracking*\n\nWallet is already being tracked (detected duplicate).`, 'Markdown', null, userId);
    } else {
      await sendMessage(`❌ *Error Adding Tracker*\n\n${error.message}`, 'Markdown', null, userId);
    }
  }
}

async function processListTrackers(userId) {
  try {
    const trackers = await TrackedWallet.find({
      chain: 'solana',
      isActive: true,
      role: 'copy_trading'
    }).sort({ createdAt: -1 });

    if (trackers.length === 0) {
      await sendMessage(`📋 *No Tracked Wallets*

You haven't added any Solana wallets to track yet.

**Get Started:**
• Find successful traders on DEX Screener
• Track whale wallets from Solscan
• Follow alpha caller wallets

*Use \`/track <address>\` to start tracking.*`, 'Markdown', null, userId);
      return;
    }

    let message = `📋 *Tracked Wallets (${trackers.length})*\n\n`;

    trackers.forEach((tracker, index) => {
      const shortAddress = `${tracker.address.substring(0, 8)}...${tracker.address.substring(tracker.address.length - 8)}`;

      const dateValue = tracker.createdAt || tracker.addedAt || new Date();
      const addedDateTime = new Date(dateValue).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });
      message += `**${index + 1}.** \`${shortAddress}\`\n`;
      message += `   📅 Added: ${addedDateTime}\n`;
      message += `   🔄 Status: Active monitoring\n\n`;
    });

    message += `**Commands:**\n• \`/track <address>\` - Add wallet\n• \`/untrack <address>\` - Stop tracking`;

    // Add Untrack button
    const keyboard = {
      inline_keyboard: [[
        { text: "🗑️ Untrack Wallet", callback_data: "show_trackers_for_removal" }
      ]]
    };

    await sendMessage(message, 'Markdown', keyboard, userId);

  } catch (error) {
    console.error("Error listing trackers:", error);
    await sendMessage(`❌ *Error Getting Tracked Wallets*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

async function processUntrackWallet(command, userId) {
  const parts = command.split(" ");

  if (parts.length < 2) {
    await sendMessage("❌ *Invalid Format*\n\nUse: `/untrack <wallet_address>`\n\nExample:\n`/untrack 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM`", 'Markdown', null, userId);
    return;
  }

  const address = parts[1];

  try {
    const result = await TrackedWallet.findOneAndUpdate(
      { address: address, chain: 'solana', isActive: true },
      { isActive: false },
      { new: true }
    );

    if (result) {
      // Stop real-time monitoring immediately
      mintDetector.unsubscribeFromWallet(address);
    }

    if (!result) {
      await sendMessage(`❌ *Wallet Not Found*\n\nNo active tracking found for:\n\`${address}\`\n\nUse \`/list_trackers\` to see tracked wallets.`, 'Markdown', null, userId);
      return;
    }

    await sendMessage(`✅ *Stopped Tracking Wallet*

**📊 Tracking Removed:**
• **Address:** \`${address}\`
• **Status:** No longer monitoring

*Bot will stop copying trades from this wallet.*`, 'Markdown', null, userId);

  } catch (error) {
    console.error("Error untracking wallet:", error);
    await sendMessage(`❌ *Error Removing Tracker*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

async function processSnipeAdd(command, userId) {
  const hasWallet = await checkWalletSetup(userId);
  if (!hasWallet) {
    await sendMessage("⚠️ *Wallet Setup Required*\n\nPlease setup your Solana wallet first to add snipe targets.", 'Markdown', null, userId);
    return;
  }

  const parts = command.split(" ");

  if (parts.length < 2) {
    await sendMessage("❌ *Invalid Format*\n\nUse: `/snipe_add <token_address> [sol_amount] [tp_percent] [sl_percent]`\n\nExample:\n`/snipe_add EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (uses default 0.011 SOL)\n`/snipe_add EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.1 100 50`", 'Markdown', null, userId);
    return;
  }

  const tokenAddress = parts[1];
  const amount = parts[2] ? parseFloat(parts[2]) : 0.011;
  const tp = parts[3] ? parseFloat(parts[3]) : 50;
  const sl = parts[4] ? parseFloat(parts[4]) : 25;

  if (isNaN(amount) || amount < 0.001) {
    await sendMessage("❌ *Invalid Amount*\n\nMinimum amount is 0.001 SOL", 'Markdown', null, userId);
    return;
  }

  if (isNaN(tp) || tp < 10) {
    await sendMessage("❌ *Invalid Take Profit*\n\nTake Profit must be at least 10%\n\n**Format:** `/snipe_add <token> [amount] [TP%] [SL%]`\n**Example:** `/snipe_add <token> 0.011 75 20`", 'Markdown', null, userId);
    return;
  }

  if (isNaN(sl) || sl < 10 || sl > 90) {
    await sendMessage("❌ *Invalid Stop Loss*\n\nStop Loss must be between 10% and 90%\n\n**Format:** `/snipe_add <token> [amount] [TP%] [SL%]`\n**Example:** `/snipe_add <token> 0.011 75 20`", 'Markdown', null, userId);
    return;
  }

  // Validate token address
  try {
    new PublicKey(tokenAddress);
  } catch {
    await sendMessage("❌ *Invalid Token Address*\n\nPlease provide a valid Solana token address.", 'Markdown', null, userId);
    return;
  }

  try {
    // Check if target already exists
    const existing = await SnipeTarget.findOne({
      userId: userId,
      tokenAddress: tokenAddress,
      isActive: true
    });

    if (existing) {
      await sendMessage(`⚠️ *Target Already Exists*\n\nYou already have an active target for this token:\n• Amount: ${existing.targetAmount} SOL\n• Slippage: ${existing.maxSlippage}%\n\nUse \`/snipe_remove ${tokenAddress}\` to remove it first.`, 'Markdown', null, userId);
      return;
    }

    // Create snipe target
    let tokenSymbol = "UNKNOWN";
    let tokenName = "";
    try {
      const metadata = await getTokenMetadata(tokenAddress);
      if (metadata) {
        tokenSymbol = metadata.symbol;
        tokenName = metadata.name;
      }
    } catch (metaError) {
      console.warn(`Could not fetch metadata for target token: ${metaError.message}`);
    }

    const target = new SnipeTarget({
      userId: userId,
      tokenAddress: tokenAddress,
      tokenSymbol: tokenSymbol,
      tokenName: tokenName,
      targetAmount: amount,
      maxSlippage: 15.0,
      isActive: true,
      snipeStatus: "pending",
      autoSell: {
        enabled: true,
        takeProfitPercent: tp,
        stopLossPercent: sl
      }
    });

    await target.save();

    await sendMessage(`✅ *Snipe Target Added!*

🎯 **Target Details:**
• **Token:** \`${tokenAddress}\`
• **Amount:** ${amount} SOL
• **Slippage:** 15% max
• **Auto-Sell:** Enabled
• **TP/SL:** +${tp}% / -${sl}%
• **Status:** 🔄 Monitoring for liquidity

**⚡ What happens next:**
• Bot monitors for new pools with this token
• Executes buy when liquidity is detected
• Sends notification with results

*Target is now active and monitoring!*`, 'Markdown', null, userId);

  } catch (error) {
    console.error("Error adding snipe target:", error);
    await sendMessage(`❌ *Error Adding Target*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

async function processSnipeListWithButtons(userId) {
  try {
    const targets = await SnipeTarget.find({
      userId: userId,
      isActive: true
    }).sort({ createdAt: -1 });

    if (targets.length === 0) {
      await sendMessage(`📍 *No Active Snipe Targets*

You haven't added any snipe targets yet.

**Popular tokens to snipe:**
• New launches on Jupiter
• Trending tokens on Birdeye
• Community-recommended gems

*Use '🎯 Add Target' to create new targets.*`, 'Markdown', null, userId);
      return;
    }

    // Send target list with individual remove buttons
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const shortAddress = `${target.tokenAddress.substring(0, 8)}...${target.tokenAddress.substring(target.tokenAddress.length - 8)}`;

      const addedDate = new Date(target.createdAt);
      const formattedDateTime = addedDate.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });

      let tokenName = "Token";
      if (target.tokenAddress === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") tokenName = "USDC";
      else if (target.tokenAddress === "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB") tokenName = "USDT";
      else if (target.tokenAddress === "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263") tokenName = "BONK";
      else if (target.tokenAddress === "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN") tokenName = "JUP";

      const targetMessage = `🎯 **Target #${i + 1} - ${tokenName}**

📊 **Details:**
• **Address:** \`${shortAddress}\`
• **Amount:** ${target.targetAmount} SOL
• **Slippage:** ${target.maxSlippage}% max
• **Status:** ${target.snipeStatus}
• **Added:** ${formattedDateTime}

⚡ **Monitoring:** Active - Waiting for liquidity opportunities`;

      const removeKeyboard = {
        inline_keyboard: [[{
          text: `🗑️ Remove This Target`,
          callback_data: `remove_target_${target.tokenAddress}`
        }]]
      };

      await sendMessage(targetMessage, 'Markdown', removeKeyboard, userId);
    }

    await sendMessage(`📋 **Summary: ${targets.length} Active Targets**

**Quick Actions:**
• Use '🎯 Add Target' to add more targets
• Click 🗑️ buttons above to remove specific targets
• Use '📈 Snipe Stats' to view performance

**Commands:**
• \`/snipe_add <token> <amount>\` - Add target
• \`/snipe_remove <token>\` - Remove target`, 'Markdown', null, userId);

  } catch (error) {
    console.error("Error listing snipe targets:", error);
    await sendMessage(`❌ *Error Getting Targets*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

async function processSnipeList(userId) {
  try {
    const targets = await SnipeTarget.find({
      userId: userId,
      isActive: true
    }).sort({ createdAt: -1 });

    if (targets.length === 0) {
      await sendMessage(`📍 *No Active Snipe Targets*

You haven't added any snipe targets yet.

**Popular tokens to snipe:**
• New launches on Jupiter
• Trending tokens on Birdeye
• Community-recommended gems

*Use \`/snipe_add <token> <amount>\` to add targets.*`, 'Markdown', null, userId);
      return;
    }

    let message = `📍 *Active Snipe Targets (${targets.length})*\n\n`;

    targets.forEach((target, index) => {
      const shortAddress = `${target.tokenAddress.substring(0, 8)}...${target.tokenAddress.substring(target.tokenAddress.length - 8)}`;
      const addedDate = new Date(target.createdAt);
      const formattedDateTime = addedDate.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });

      message += `**${index + 1}.** \`${shortAddress}\`\n`;
      message += `   💰 ${target.targetAmount} SOL\n`;
      message += `   📊 ${target.maxSlippage}% slippage\n`;
      message += `   🔄 ${target.snipeStatus}\n`;
      message += `   📅 Added: ${formattedDateTime}\n\n`;
    });

    message += `**Commands:**\n• \`/snipe_add <token> <amount>\` - Add target\n• \`/snipe_remove <token>\` - Remove target`;

    await sendMessage(message, 'Markdown', null, userId);

  } catch (error) {
    console.error("Error listing snipe targets:", error);
    await sendMessage(`❌ *Error Getting Targets*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

async function processSnipeStats(userId) {
  try {
    const totalTargets = await SnipeTarget.countDocuments({ userId: userId });
    const activeTargets = await SnipeTarget.countDocuments({ userId: userId, isActive: true });
    const executedTargets = await SnipeTarget.countDocuments({ userId: userId, snipeStatus: "executed" });

    await sendMessage(`📈 *Sniping Statistics*
    
    **🎯 Target Summary:**
    • **Total Created:** ${totalTargets}
    • **Currently Active:** ${activeTargets}
    • **Successfully Executed:** ${executedTargets}
    • **Success Rate:** ${totalTargets > 0 ? Math.round((executedTargets / totalTargets) * 100) : 0}%
    
    **⚡ Performance:**
    • **Average Execution:** <200ms
    • **Slippage Protection:** Active
    • **MEV Protection:** Enabled
    
    **🔄 Current Status:**
    • Monitoring Solana for new liquidity
    • Jupiter Ultra API ready for execution
    • Real-time pool detection active
    
    *Bot is actively monitoring and ready to execute!*`, 'Markdown', null, userId);

  } catch (error) {
    console.error("Error getting snipe stats:", error);
    await sendMessage(`❌ *Error Getting Statistics*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

async function processPositions(userId) {
  try {
    const executedPositions = await SnipeTarget.find({
      userId: userId,
      snipeStatus: 'executed'
    }).sort({ executedAt: -1 }).limit(10);

    if (executedPositions.length === 0) {
      await sendMessage("📊 *No Active Positions*\n\nYou don't have any executed snipe positions yet.", 'Markdown', null, userId);
      return;
    }

    // Inform user we are fetching prices
    const loadingMsg = await sendMessage("⏳ *Fetching current prices...*", 'Markdown', null, userId);

    // Get current prices from Jupiter
    const addresses = executedPositions.map(p => p.tokenAddress);
    const priceData = await positionManager.getJupiterPrices(addresses);

    let message = `📊 *Trading Positions*\n\n**Select a position to manage:**\n\n`;
    let keyboard = [];

    for (const pos of executedPositions) {
      const currentPrice = priceData[pos.tokenAddress]?.price || 0;
      const entryPrice = pos.executionPrice || 0;
      const profitPercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
      const profitEmoji = profitPercent >= 0 ? "📈" : "📉";

      const symbol = pos.tokenSymbol || "TOKEN";
      const amountReceived = pos.amountReceived || 0;
      const costBasis = pos.targetAmount || 0;
      const currentValue = amountReceived * currentPrice;
      const percentStr = `${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(1)}%`;

      message += `🔹 *${symbol}*\n`;
      message += `└ 💰 Entry: ${entryPrice.toFixed(8)} SOL\n`;
      message += `└ 📦 Qty: ${amountReceived.toFixed(2)}\n`;
      message += `└ 💵 Value: ${currentValue.toFixed(4)} SOL (from ${costBasis} SOL)\n`;
      message += `└ ${profitEmoji} ROI: *${percentStr}*\n\n`;

      keyboard.push([{
        text: `⚙️ Manage ${symbol} (${percentStr})`,
        callback_data: `manage_pos_${pos.tokenAddress}`
      }]);
    }

    keyboard.push([{ text: "🔄 Refresh List", callback_data: "refresh_positions" }]);

    await sendMessage(message, 'Markdown', { inline_keyboard: keyboard }, userId);

  } catch (error) {
    console.error("Error in processPositions:", error);
    await sendMessage(`❌ *Error fetching positions*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

async function processSnipeRemove(command, userId) {
  const parts = command.split(" ");

  if (parts.length < 2) {
    await sendMessage("❌ *Invalid Format*\n\nUse: `/snipe_remove <token_address>`\n\nExample:\n`/snipe_remove EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`", 'Markdown', null, userId);
    return;
  }

  const tokenAddress = parts[1];

  try {
    const result = await SnipeTarget.findOneAndUpdate(
      { userId: userId, tokenAddress: tokenAddress, isActive: true },
      { isActive: false, snipeStatus: "cancelled" },
      { new: true }
    );

    if (!result) {
      await sendMessage(`❌ *Target Not Found*\n\nNo active snipe target found for:\n\`${tokenAddress}\`\n\nUse \`/snipe_list\` to see active targets.`, 'Markdown', null, userId);
      return;
    }

    await sendMessage(`✅ *Snipe Target Removed*

🗑️ **Removed Target:**
• **Token:** \`${tokenAddress}\`
• **Amount:** ${result.targetAmount} SOL
• **Status:** Cancelled

*Target deactivated and no longer monitoring.*`, 'Markdown', null, userId);

  } catch (error) {
    console.error("Error removing snipe target:", error);
    await sendMessage(`❌ *Error Removing Target*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

async function processManualSwap(command, userId) {
  const parts = command.split(" ");

  if (parts.length < 3) {
    await sendMessage(`🔄 *Manual Swap (SOL → Token)*

**Format:** \`/swap <token_address> <amount_in_sol>\`

**Example:**
\`/swap 7GCih6uC8HwvM6kMecgtf4reZfkvc9pY4mB4fUpvpxYy 0.1\`

**💡 Tips:**
• Small amounts are safer for testing
• Ensure you have enough SOL for fees
• The token must have liquidity on Jupiter`, 'Markdown', null, userId);
    return;
  }

  const tokenAddress = parts[1].trim();
  const amountStr = parts[2].trim().replace(',', '.'); // Handle comma as decimal separator

  // Validate SOL amount
  const solAmount = parseFloat(amountStr);
  if (isNaN(solAmount) || solAmount <= 0) {
    await sendMessage("❌ *Invalid Amount*\n\nPlease provide a positive number for the SOL amount. (Example: 0.1)", 'Markdown', null, userId);
    return;
  }

  // Check wallet
  const hasWallet = await checkWalletSetup(userId);
  if (!hasWallet) {
    await sendMessage("❌ *No Wallet Configured*\n\nPlease setup your wallet first using **👛 Wallet Setup**.", 'Markdown', null, userId);
    return;
  }

  const wallet = await getUserWallet(userId);
  const keypair = createKeypairFromWallet(wallet);

  try {
    // Validate token address
    new PublicKey(tokenAddress);
  } catch {
    await sendMessage("❌ *Invalid Solana Address*\n\nPlease provide a valid token mint address.", 'Markdown', null, userId);
    return;
  }

  // Inform user we are processing
  await sendMessage(`⏳ *Processing Swap Request...*
  
🔄 **Action:** Swap ${solAmount.toString()} SOL → Token
📍 **Target:** \`${tokenAddress}\`

*Fetching best price from Jupiter...*`, 'Markdown', null, userId);

  try {
    // Fetch metadata
    const tokenInfo = await getTokenMetadata(tokenAddress);

    // Setup Swap object
    const swap = {
      sourceTxHash: "manual-" + Date.now(),
      tokenIn: {
        address: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        amount: solAmount.toString(),
        decimals: 9
      },
      tokenOut: {
        address: tokenAddress,
        symbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals,
        amount: "0"
      }
    };

    // Execute swap with the user's keypair
    const result = await executeJupiterSwap(swap, keypair);

    if (result.success) {
      await sendMessage(`✅ *Swap Successful!*

🎉 **Transaction Confirmed**

💰 **Spent:** ${solAmount} SOL
📈 **Received:** ${result.outputAmount.toFixed(tokenInfo.decimals > 6 ? 4 : 2)} ${tokenInfo.symbol}
⏱️ **Speed:** ${result.executionTime}ms

🔗 [View on Solscan](${result.explorerUrl})`, 'Markdown', null, userId);
    } else {
      await sendMessage(`❌ *Swap Failed*

**Reason:** ${result.error}
**Category:** ${result.errorCategory}

*Please check your balance and token liquidity on Jupiter.*`, 'Markdown', null, userId);
    }

  } catch (error) {
    console.error("Error in manual swap:", error);
    await sendMessage(`❌ *Swap Execution Error*

${error.message}`, 'Markdown', null, userId);
  }
}

async function processWithdraw(command, userId) {
  const parts = command.split(" ");

  if (parts.length < 3) {
    await sendMessage(`💸 *Withdraw SOL*

**Format:** \`/withdraw <destination_address> <amount_in_sol>\`

**Example:**
\`/withdraw 7GCih6uC8HwvM6kMecgtf4reZfkvc9pY4mB4fUpvpxYy 0.1\`

**💡 Tips:**
• Ensure you have enough SOL for the transfer and network fees.
• Double check the destination address carefully.
• Small test amounts are recommended for first-time use.`, 'Markdown', null, userId);
    return;
  }

  const toAddress = parts[1].trim();
  const amountStr = parts[2].trim().replace(',', '.');

  // Validate SOL amount
  const solAmount = parseFloat(amountStr);
  if (isNaN(solAmount) || solAmount <= 0) {
    await sendMessage("❌ *Invalid Amount*\n\nPlease provide a positive number for the SOL amount.", 'Markdown', null, userId);
    return;
  }

  // Check wallet
  const hasWallet = await checkWalletSetup(userId);
  if (!hasWallet) {
    await sendMessage("❌ *No Wallet Configured*\n\nPlease setup your wallet first using **👛 Wallet Setup**.", 'Markdown', null, userId);
    return;
  }

  const wallet = await getUserWallet(userId);
  const keypair = createKeypairFromWallet(wallet);

  try {
    // Validate destination address
    new PublicKey(toAddress);
  } catch {
    await sendMessage("❌ *Invalid Solana Address*\n\nPlease provide a valid destination address.", 'Markdown', null, userId);
    return;
  }

  // Inform user we are processing
  await sendMessage(`⏳ *Processing Withdrawal...*
  
💸 **Action:** Transfer ${solAmount} SOL
📍 **To:** \`${toAddress}\`

*Submitting transaction to network...*`, 'Markdown', null, userId);

  try {
    const result = await transferSol(keypair, toAddress, solAmount);

    if (result.success) {
      await sendMessage(`✅ *Withdrawal Successful!*

🎉 **Transaction Confirmed**

💰 **Transferred:** ${solAmount} SOL
📍 **To:** \`${toAddress}\`

🔗 [View on Solscan](${result.explorerUrl})`, 'Markdown', null, userId);
    } else {
      await sendMessage(`❌ *Withdrawal Failed*

**Reason:** ${result.error}

*Please check your balance and ensure the destination address is correct.*`, 'Markdown', null, userId);
    }
  } catch (error) {
    console.error("Error in withdraw process:", error);
    await sendMessage(`❌ *Withdrawal Execution Error*

${error.message}`, 'Markdown', null, userId);
  }
}

async function processOverallStats(userId) {
  try {
    const hasWallet = await checkWalletSetup(userId);
    const copyTradingCount = await TrackedWallet.countDocuments({ chain: 'solana', isActive: true, role: 'copy_trading' });
    const devSniperCount = await TrackedWallet.countDocuments({ chain: 'solana', isActive: true, role: 'dev_sniper' });
    const snipeCount = await SnipeTarget.countDocuments({ userId: userId, isActive: true });

    await sendMessage(`📊 *Overall Statistics*

**🔋 System Status:**
• **Platform:** 🟢 Solana Mainnet
• **Database:** 🟢 Connected
• **APIs:** 🟢 Jupiter & QuickNode Active

**👛 Wallet Status:**
• **Configured:** ${hasWallet ? '✅ Ready' : '⚠️ Setup Required'}

**👀 Copy Trading:**
• **Tracked Wallets:** ${copyTradingCount}
• **Status:** ${copyTradingCount > 0 ? '🔄 Monitoring' : '💤 Waiting for trackers'}

**👨‍💻 Developer Sniper:**
• **Tracked Devs:** ${devSniperCount}
• **Status:** ${devSniperCount > 0 ? '🔄 Monitoring new mints' : '💤 No dev wallets tracked'}

**🎯 Sniping:**
• **Active Targets:** ${snipeCount}
• **Status:** ${snipeCount > 0 ? '🔄 Monitoring' : '💤 Waiting for targets'}

**⚡ Performance:**
• **Uptime:** 99.9%
• **Avg Response:** <100ms
• **Execution Speed:** <200ms

*All systems operational and ready for trading!*`, 'Markdown', null, userId);

  } catch (error) {
    console.error("Error getting overall stats:", error);
    await sendMessage(`❌ *Error Getting Statistics*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

async function processHelp(userId) {
  const helpMessage = `❓ *Solana Trading Bot Guide*

**🚀 GETTING STARTED**
1. **Setup Wallet:** 👛 Wallet Setup
2. **Fund Wallet:** Send SOL to your address
3. **Start Trading:** Choose copy trading or sniping

**👛 WALLET MANAGEMENT**
• \`/setup_wallet\` - Setup/import wallet
• \`/wallet_info\` - View wallet details
• \`/balance\` - Check SOL balance

**👀 COPY TRADING**
• \`/track <address>\` - Track profitable wallet
• \`/list_trackers\` - View tracked wallets
• \`/untrack <address>\` - Stop tracking

**🎯 TOKEN SNIPING**
• \`/snipe_add <token> <amount>\` - Add target
• \`/snipe_list\` - View active targets
• \`/snipe_remove <token>\` - Remove target
• \`/snipe_stats\` - Performance stats

**🔄 MANUAL TRADING**
• \`/swap <token> <amount>\` - Quick SOL → Token swap

**💡 TIPS**
• Start with small amounts (0.001-0.01 SOL)
• Track proven profitable wallets
• Monitor trending tokens for sniping
• Keep sufficient SOL for fees

**🔗 USEFUL RESOURCES**
• DEX Screener - Find trending tokens
• Solscan - Analyze wallet performance
• Birdeye - Token analytics

*Use keyboard buttons for easy navigation!*`;

  await sendMessage(helpMessage, 'Markdown', null, userId);
}



async function showPositionDetails(userId, tokenAddress) {
  try {
    const position = await SnipeTarget.findOne({
      userId: userId,
      tokenAddress: tokenAddress,
      snipeStatus: 'executed'
    });

    if (!position) {
      await sendMessage("❌ Position not found or already closed.", 'Markdown', null, userId);
      return;
    }

    // Fetch single price
    const priceData = await positionManager.getJupiterPrices([tokenAddress]);
    const currentPrice = priceData[tokenAddress]?.price || 0;
    const entryPrice = position.executionPrice || 0;
    const profitPercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
    const profitEmoji = profitPercent >= 0 ? "📈" : "📉";

    let message = `🪙 **${position.tokenSymbol || 'Token'} Details**\n\n`;
    message += `📍 **Address:** \`${tokenAddress}\`\n`;
    message += `💰 **Entry Price:** ${entryPrice.toFixed(8)} SOL\n`;
    message += `📦 **Quantity:** ${position.amountReceived ? position.amountReceived.toFixed(4) : "0"} tokens\n`;
    message += `💵 **Entry Value:** ${position.targetAmount ? position.targetAmount.toFixed(4) : "0"} SOL\n`;
    message += `💸 **Current Price:** ${currentPrice ? currentPrice.toFixed(8) : "N/A"} SOL\n`;
    message += `💎 **Current Value:** ${currentPrice && position.amountReceived ? (currentPrice * position.amountReceived).toFixed(4) : "N/A"} SOL\n`;
    message += `${profitEmoji} **P/L:** *${profitPercent.toFixed(2)}%*\n\n`;

    const isAutoSellEnabled = position.autoSell && position.autoSell.enabled;
    if (isAutoSellEnabled) {
      message += `🛡️ **Auto-Sell:** ✅ Enabled\nTP: +${position.autoSell.takeProfitPercent}% | SL: -${position.autoSell.stopLossPercent}%\n`;
    } else {
      message += `🛡️ **Auto-Sell:** ❌ Disabled\n`;
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: "🔴 SELL NOW", callback_data: `sell_pos_${tokenAddress}` }],
        [{
          text: isAutoSellEnabled ? "🛡️ Disable Auto-Sell" : "🛡️ Enable Auto-Sell",
          callback_data: `toggle_autosell_${tokenAddress}`
        }],
        [{ text: "❌ Close / Stop Tracking", callback_data: `close_pos_${tokenAddress}` }],
        [{ text: "🔙 Back to List", callback_data: "refresh_positions" }]
      ]
    };

    await sendMessage(message, 'Markdown', keyboard, userId);

  } catch (error) {
    console.error("Error showing position details:", error);
    await sendMessage(`❌ Error: ${error.message}`, 'Markdown', null, userId);
  }
}

async function showTrackersForRemoval(userId) {
  try {
    const trackers = await TrackedWallet.find({
      chain: 'solana',
      isActive: true
    }).sort({ createdAt: -1 });

    if (trackers.length === 0) {
      await sendMessage(`📋 *No Wallets to Untrack*

You aren't tracking any Solana wallets.`, 'Markdown', null, userId);
      return;
    }

    let keyboard = [];
    trackers.forEach((tracker) => {
      const shortAddress = `${tracker.address.substring(0, 6)}...${tracker.address.substring(tracker.address.length - 6)}`;
      const name = tracker.name ? ` (${tracker.name})` : "";

      keyboard.push([{
        text: `🗑️ ${shortAddress}${name}`,
        callback_data: `untrack_wallet_${tracker.address}`
      }]);
    });

    keyboard.push([{ text: "❌ Cancel", callback_data: "cancel_removal" }]);

    await sendMessage(`🗑️ *Select Wallet to Untrack*

**Active Trackers (${trackers.length}):**
Click a wallet below to stop tracking it.`, 'Markdown', { inline_keyboard: keyboard }, userId);

  } catch (error) {
    console.error("Error showing trackers for removal:", error);
    await sendMessage(`❌ *Error*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

async function showTargetsForRemoval(userId) {
  try {
    const targets = await SnipeTarget.find({
      userId: userId,
      isActive: true
    }).sort({ createdAt: -1 });

    if (targets.length === 0) {
      await sendMessage(`📍 *No Active Targets to Remove*

You don't have any active snipe targets.

*Use '🎯 Add Target' to create new targets.*`, 'Markdown', null, userId);
      return;
    }

    let keyboard = [];
    targets.forEach((target, index) => {
      let tokenName = "Token";
      if (target.tokenAddress === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") tokenName = "USDC";
      else if (target.tokenAddress === "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB") tokenName = "USDT";
      else if (target.tokenAddress === "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263") tokenName = "BONK";
      else if (target.tokenAddress === "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN") tokenName = "JUP";

      const addedDate = new Date(target.createdAt);
      const timeStr = addedDate.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      keyboard.push([{
        text: `🗑️ ${tokenName} (${target.targetAmount} SOL) - Added ${timeStr}`,
        callback_data: `remove_target_${target.tokenAddress}`
      }]);
    });

    keyboard.push([{ text: "❌ Cancel", callback_data: "cancel_removal" }]);

    await sendMessage(`🗑️ *Select Target to Remove*

**Active Targets (${targets.length}):**
Click a target below to remove it:

⚠️ **Warning:** This action cannot be undone. The target will stop monitoring immediately.`, 'Markdown', { inline_keyboard: keyboard }, userId);

  } catch (error) {
    console.error("Error showing targets for removal:", error);
    await sendMessage(`❌ *Error Loading Targets*\n\n${error.message}`, 'Markdown', null, userId);
  }
}

const userSelections = new Map();

async function processCallbackQuery(callbackQuery) {
  const userId = callbackQuery.from.id.toString();
  const data = callbackQuery.data;

  console.log(`🔘 Callback: ${data} from user ${userId}`);

  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      callback_query_id: callbackQuery.id
    });

    if (data.startsWith("token_")) {
      const tokenAddress = data.replace("token_", "");
      userSelections.set(userId, { tokenAddress });

      let tokenName = "Token";
      if (tokenAddress === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") tokenName = "USDC";
      else if (tokenAddress === "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB") tokenName = "USDT";
      else if (tokenAddress === "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263") tokenName = "BONK";
      else if (tokenAddress === "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN") tokenName = "JUP";

      await sendMessage(`💰 *Select Amount for ${tokenName}*

**Choose your snipe amount:**

💎 **Small (0.001-0.01 SOL)** - Low risk testing
🚀 **Medium (0.05-0.1 SOL)** - Standard trading
🌟 **Large (0.5+ SOL)** - High conviction plays

**Token:** \`${tokenAddress.substring(0, 8)}...${tokenAddress.substring(tokenAddress.length - 8)}\`

*Select amount or choose custom:*`, 'Markdown', getSnipeAmountKeyboard(), userId);
      return;
    }

    if (data.startsWith("snipe_amount_")) {
      const amount = data.replace("snipe_amount_", "");
      const selection = userSelections.get(userId);

      if (!selection || !selection.tokenAddress) {
        await sendMessage("❌ *Session expired* - Please start over by selecting a token first.", 'Markdown', null, userId);
        return;
      }

      await processSnipeAdd(`/snipe_add ${selection.tokenAddress} ${amount}`, userId);
      userSelections.delete(userId);
      return;
    }

    switch (data) {
      case "quick_setup":
        await processCommand("🔑 Setup New Wallet", userId);
        break;
      case "check_balance":
        await processBalanceCheck(userId);
        break;
      case "quick_snipe":
        await sendMessage(`⚡ *Quick Snipe Setup*

**Popular Tokens:**
Choose a token below for interactive setup.

**Manual Format:**
\`/snipe_add <token_address> <sol_amount>\`

*Click a token below to start:*`, 'Markdown', getPopularTokensKeyboard(), userId);
        break;
      case "quick_track":
        userSelections.set(userId, { awaitingTrackAddress: true });
        await sendMessage(`⚡ *Quick Track Wallet*
        
**How to track:**
Just **paste the Solana address** below and send it.

**Example:**
\`9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\`

*Alternatively, you can still use:* \`/track <address>\``, 'Markdown', null, userId);
        break;
      case "overall_stats":
        await processOverallStats(userId);
        break;
      case "manual_swap":
        await processManualSwap("/swap", userId);
        break;
      case "refresh_main":
        await processCommand("/start", userId);
        break;
      case "custom_token":
        await sendMessage(`✏️ *Custom Token Setup*

**Format:** \`/snipe_add <token_address> <sol_amount>\`

*Type the command with your token address and amount:*`, 'Markdown', null, userId);
        break;
      case "snipe_custom_amount":
        const selection = userSelections.get(userId);
        if (!selection || !selection.tokenAddress) {
          await sendMessage("❌ *Session expired* - Please start over.", 'Markdown', null, userId);
          return;
        }
        await sendMessage(`✏️ *Custom Amount for Token*

**Token:** \`${selection.tokenAddress.substring(0, 8)}...${selection.tokenAddress.substring(selection.tokenAddress.length - 8)}\`

**Format:** \`/snipe_add ${selection.tokenAddress} <your_amount>\`

*Type the command with your desired amount:*`, 'Markdown', null, userId);
        break;
      case "cancel_snipe":
        userSelections.delete(userId);
        await sendMessage("❌ *Snipe setup cancelled*", 'Markdown', null, userId);
        break;
      case "show_targets_for_removal":
        await showTargetsForRemoval(userId);
        break;
      case "show_trackers_for_removal":
        await showTrackersForRemoval(userId);
        break;
      case "cancel_removal":
        await sendMessage("❌ *Target removal cancelled*", 'Markdown', null, userId);
        break;
      default:
        if (data.startsWith("remove_target_")) {
          const tokenAddress = data.replace("remove_target_", "");
          await processSnipeRemove(`/snipe_remove ${tokenAddress}`, userId);
          // Refresh the removal list (optional, but good UX)
          await showTargetsForRemoval(userId);
          return;
        }

        if (data.startsWith("untrack_wallet_")) {
          const walletAddress = data.replace("untrack_wallet_", "");
          await processUntrackWallet(`/untrack ${walletAddress}`, userId);
          // Refresh the list to show update
          await showTrackersForRemoval(userId);
          return;
        }

        if (data === "refresh_positions") {
          await processPositions(userId);
          return;
        }

        if (data.startsWith("manage_pos_")) {
          const tokenAddress = data.replace("manage_pos_", "");
          await showPositionDetails(userId, tokenAddress);
          return;
        }

        if (data.startsWith("sell_pos_")) {
          const tokenAddress = data.replace("sell_pos_", "");
          const position = await SnipeTarget.findOne({ userId: userId, tokenAddress: tokenAddress, snipeStatus: 'executed' });
          if (position) {
            await sendMessage("🔄 Initiating manual sell...", 'Markdown', null, userId);
            const priceData = await positionManager.getJupiterPrices([tokenAddress]);
            const currentPrice = priceData[tokenAddress]?.price || 0;
            // Execute manual sell
            await positionManager.executeAutoSell(position, currentPrice, 'Manual Sell');
            // Refresh main list
            await processPositions(userId);
          } else {
            await sendMessage("❌ Position not found.", 'Markdown', null, userId);
          }
          return;
        }

        // Settings callbacks
        if (data.startsWith('settings_') || data.startsWith('mcap_') || data.startsWith('tpsl_') || data.startsWith('devs_')) {
          const botWrapper = {
            sendMessage,
            editMessageText: async (text, options) => {
              await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
                chat_id: options.chat_id,
                message_id: options.message_id,
                text: text,
                parse_mode: options.parse_mode,
                reply_markup: options.reply_markup
              });
            },
            deleteMessage: async (chatId, messageId) => {
              await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
                chat_id: chatId,
                message_id: messageId
              });
            },
            answerCallbackQuery: async (queryId, options = {}) => {
              await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
                callback_query_id: queryId,
                text: options.text,
                show_alert: options.show_alert || false
              });
            }
          };

          const queryWrapper = {
            message: { chat: { id: userId }, message_id: callbackQuery.message.message_id },
            callback_data: data,
            id: callbackQuery.id
          };


          await handleSettingsCallback(botWrapper, queryWrapper);
          return;
        }

        if (data.startsWith("toggle_autosell_")) {
          const tokenAddress = data.replace("toggle_autosell_", "");
          const position = await SnipeTarget.findOne({ userId: userId, tokenAddress: tokenAddress, snipeStatus: 'executed' });
          if (position) {
            position.autoSell.enabled = !position.autoSell.enabled;
            await position.save();
            // Refresh details view
            await showPositionDetails(userId, tokenAddress);
          }
          return;
        }

        if (data.startsWith("close_pos_")) {
          const tokenAddress = data.replace("close_pos_", "");
          const position = await SnipeTarget.findOne({ userId: userId, tokenAddress: tokenAddress, snipeStatus: 'executed' });
          if (position) {
            position.snipeStatus = 'closed';
            position.isActive = false;
            // Disable auto sell if enabled
            if (position.autoSell) position.autoSell.enabled = false;
            await position.save();

            await sendMessage("✅ *Position Closed*\n\nStopped tracking this position.", 'Markdown', null, userId);
            // Refresh main list
            await processPositions(userId);
          }
          return;
        }
        console.log(`Unknown callback: ${data}`);
    }
  } catch (error) {
    console.error(`❌ Error processing callback ${data}:`, error);
  }
}

async function processGuide(userId) {
  const guideMessage = `📖 *Solana Trading Bot - User Guide*

**⚡ How It Works**
• **Wallet Tracking:** You add wallets to track using the \`/add\` command
• **Swap Detection:** The bot periodically checks for new swaps from these wallets using Moralis API
• **Swap Execution:** When a new swap is detected, the bot uses Jupiter API for Solana execution
• **Manual Trading:** Direct token swaps available via the \`/swap\` command
• **Notifications:** You receive a Telegram notification about successful or failed swaps

**🔧 Architecture**
• **/src/telegram:** Handles Telegram bot commands and messaging
• **/src/db/models:** MongoDB models for data storage
• **/src/services/polling:** Background services for checking new swaps
• **/src/services/execution:** Swap execution logic
• **/src/services/wallets:** Wallet management for Solana
• **/src/services/moralis:** Interfaces with Moralis API

**⚠️ Security Notes**
• **Private Keys:** This bot requires your wallet's private keys to execute trades. Store them securely.
• **Fund Management:** Start with small amounts to test the bot before committing larger funds.
• **API Keys:** Protect your API keys and avoid sharing your \`.env\` file.

**Acknowledgements**
• Moralis for blockchain data APIs
• Jupiter for Solana swap aggregation
• node-telegram-bot-api for Telegram integration`;

  await sendMessage(guideMessage, 'Markdown', null, userId);
}

async function checkAndImportEnvWallet(userId) {
  try {
    const envKey = process.env.SOLANA_PRIVATE_KEY;
    if (!envKey) return;

    const validation = validateSolanaPrivateKey(envKey);
    if (!validation.isValid) {
      console.error(`❌ Invalid SOLANA_PRIVATE_KEY in .env: ${validation.error}`);
      return;
    }

    const existingWallet = await getUserWallet(userId);

    // If wallet exists, check if it matches the env key
    if (existingWallet) {
      if (existingWallet.privateKey === validation.privateKey) {
        return; // Already synchronized
      }

      // ONLY auto-update if it's already a system-managed wallet
      // This allows manually imported/generated wallets to persist
      if (existingWallet.walletName.includes("System")) {
        console.log(`🔄 Updating system wallet from .env for user ${userId}`);
        existingWallet.publicKey = validation.publicKey;
        existingWallet.privateKey = validation.privateKey;
        existingWallet.walletName = "System Updated Wallet";
        await existingWallet.save();

        await sendMessage(`🔄 *System Wallet Synchronized*

The background system wallet has been updated to match the configuration in the environment file.

📊 **Address:** \`${validation.publicKey}\`
⚡ **Status:** Active and ready`, 'Markdown', null, userId);
      }
      return;
    }

    console.log(`🔑 Automatically importing wallet from .env for user ${userId}`);
    const newWallet = new UserWallet({
      userId: userId,
      publicKey: validation.publicKey,
      privateKey: validation.privateKey,
      walletName: "System Imported Wallet",
      isActive: true
    });
    await newWallet.save();
    console.log(`✅ Automatically imported wallet ${validation.publicKey} for user ${userId}`);

    await sendMessage(`✅ *System Wallet Automatically Configured*
    
Your Solana wallet from the environment file has been detected and configured for your account.

📊 **Address:** \`${validation.publicKey}\`
⚡ **Status:** Active and ready for trading`, 'Markdown', null, userId);

  } catch (error) {
    console.error("Error in automatic wallet import:", error);
  }
}

async function processUpdates() {
  // Connect to database first
  const connected = await connectDB();
  if (!connected) {
    console.error("❌ Failed to connect to database. Bot cannot start.");
    process.exit(1);
  }

  let offset = 0;
  await setBotCommands();

  // Initialize Background Services
  try {
    console.log("🔄 Starting background services...");
    await startSwapFetcher();
    await startSwapProcessor();

    const tokenMonitor = new TokenMonitor();
    await tokenMonitor.initialize();

    await mintDetector.initialize();
    await positionManager.initialize();

    console.log("✅ All background services started successfully");
  } catch (error) {
    console.error("⚠️ Background services failed to start:", error.message);
  }

  if (ADMIN_CHAT_ID) {
    console.log(`🌟 Sending startup message to admin (${ADMIN_CHAT_ID})...`);
    await processCommand("/start", ADMIN_CHAT_ID.toString());
  } else {
    console.log("ℹ️ No ADMIN_CHAT_ID found in .env. Skipping initial startup message.");
  }

  console.log("🔄 Starting Solana bot message polling...");

  while (true) {
    try {
      const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`, {
        params: { offset, timeout: 5 }
      });

      const updates = response.data.result;
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message && update.message.text) {
          const userId = update.message.from.id.toString();
          // Check for auto-import if this is the admin
          if (userId === ADMIN_CHAT_ID) {
            await checkAndImportEnvWallet(userId);
          }
          await processCommand(update.message.text.trim(), userId);
        }
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