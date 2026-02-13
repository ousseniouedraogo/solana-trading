// src/telegram/commands.js
const TrackedWallet = require("../db/models/trackedWallets");
const Chain = require("../db/models/chains");
const BotConfig = require("../db/models/botConfig");
const SnipeTarget = require("../db/models/snipeTargets");
const SnipeExecution = require("../db/models/snipeExecutions");
const { getEvmBalance } = require("../services/wallets/evm");
const { getSolanaBalance } = require("../services/wallets/solana");
const { formatBotStatus, formatWalletBalance } = require("./messages");
const { getEvmTransactions, getSolanaTransactions, formatTransactionList } = require("../services/moralis/transactions");
const { cache } = require("../utils/cache");

// Helper to store chat ID in database
const storeChatId = async (chatId) => {
  try {
    // Check if we already have a chatId stored
    let chatIdConfig = await BotConfig.findOne({ setting: "chatId" });

    if (!chatIdConfig) {
      // Create new config if it doesn't exist
      chatIdConfig = new BotConfig({
        setting: "chatId",
        value: chatId.toString(),
        description: "Primary chat ID for bot notifications",
      });
      console.log(`Storing new chat ID: ${chatId}`);
    } else {
      // Update existing config
      chatIdConfig.value = chatId.toString();
      console.log(`Updating chat ID to: ${chatId}`);
    }

    await chatIdConfig.save();
    return true;
  } catch (error) {
    console.error("Error storing chat ID:", error);
    return false;
  }
};

// Command handlers
module.exports = {
  start: async (bot, msg) => {
    const chatId = msg.chat.id;

    // Store chat ID for notifications
    await storeChatId(chatId);

    const message = `
🎯 *Solana Sniping Bot*

*Quick Commands:*
• \`/snipe_add <token> <sol_amount>\` - Add snipe target
• \`/snipe_list\` - View active targets  
• \`/snipe_stats\` - Performance stats
• \`/balance solana\` - Check SOL balance

*Example:*
\`/snipe_add So11111111111111111111111111111111111111112 0.001\`
    `;

    const menuKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎯 Add Snipe Target", callback_data: "snipe_add_help" },
            { text: "📋 List Targets", callback_data: "snipe_list" }
          ],
          [
            { text: "📊 Statistics", callback_data: "snipe_stats" },
            { text: "💰 Check Balance", callback_data: "menu_balance" }
          ],
          [
            { text: "❓ Help", callback_data: "snipe_help" }
          ]
        ]
      }
    };

    bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      ...menuKeyboard
    });
  },

  help: async (bot, msg) => {
    const chatId = msg.chat.id;

    // Store chat ID for notifications
    await storeChatId(chatId);

    const message = `
🎯 *Solana Sniping Bot Help*

*Main Commands:*
• \`/snipe_add <token> <sol_amount>\` - Add snipe target
• \`/snipe_list\` - View active targets
• \`/snipe_stats\` - Performance statistics
• \`/balance solana\` - Check SOL balance

*Examples:*
\`/snipe_add So11111111111111111111111111111111111111112 0.001\`
\`/snipe_add EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.005\`

*How it works:*
1. Add tokens you want to snipe
2. Bot monitors for new liquidity
3. Executes trades automatically
4. Get instant notifications

*Settings:*
• Min amount: 0.001 SOL
• Default slippage: 15%
• Execution speed: ~200ms
    `;

    const menuKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎯 Add Target", callback_data: "snipe_add_help" },
            { text: "📋 List Targets", callback_data: "snipe_list" }
          ]
        ]
      }
    };

    bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      ...menuKeyboard
    });
  },

  addWallet: async (bot, msg, match) => {
    const chatId = msg.chat.id;

    // Store chat ID for notifications
    // await storeChatId(chatId);

    try {
      const params = match[1].trim().split(" ");

      if (params.length < 2) {
        return bot.sendMessage(
          chatId,
          "⚠️ Invalid format. Use: /add <address> <chain>"
        );
      }

      const address = params[0];
      const chainId = params[1].toLowerCase();

      // Validate chain
      const chain = await Chain.findOne({ chainId });
      if (!chain) {
        return bot.sendMessage(
          chatId,
          `⚠️ Chain '${chainId}' not supported. Use /list chains to see supported chains.`
        );
      }

      // Check if wallet already exists
      const existingWallet = await TrackedWallet.findOne({
        address,
        chain: chainId,
      });
      if (existingWallet) {
        if (existingWallet.isActive) {
          return bot.sendMessage(
            chatId,
            `⚠️ Wallet ${address} on ${chainId} is already being tracked.`
          );
        } else {
          // Reactivate the wallet
          existingWallet.isActive = true;
          await existingWallet.save();
          return bot.sendMessage(
            chatId,
            `✅ Wallet ${address} on ${chainId} has been reactivated.`
          );
        }
      }

      // Create new tracked wallet
      const newWallet = new TrackedWallet({
        address,
        chain: chainId,
        isActive: true,
      });

      await newWallet.save();

      bot.sendMessage(
        chatId,
        `✅ Now tracking wallet ${address} on ${chainId}.`
      );
    } catch (error) {
      console.error("Error adding wallet:", error);
      bot.sendMessage(chatId, `❌ Error adding wallet: ${error.message}`);
    }
  },

  removeWallet: async (bot, msg, match) => {
    const chatId = msg.chat.id;

    // Store chat ID for notifications
    // await storeChatId(chatId);

    try {
      const params = match[1].trim().split(" ");

      if (params.length < 2) {
        return bot.sendMessage(
          chatId,
          "⚠️ Invalid format. Use: /remove <address> <chain>"
        );
      }

      const address = params[0];
      const chainId = params[1].toLowerCase();

      // Find the wallet
      const wallet = await TrackedWallet.findOne({ address, chain: chainId });

      if (!wallet) {
        return bot.sendMessage(
          chatId,
          `⚠️ Wallet ${address} on ${chainId} is not being tracked.`
        );
      }

      // Hard delete the wallet to avoid residual addresses
      const deleteResult = await TrackedWallet.deleteOne({ address, chain: chainId });

      if (deleteResult.deletedCount === 0) {
        return bot.sendMessage(
          chatId,
          `⚠️ Wallet ${address} on ${chainId} was not found.`
        );
      }

      bot.sendMessage(
        chatId,
        `✅ Stopped tracking wallet ${address} on ${chainId}.`
      );
    } catch (error) {
      console.error("Error removing wallet:", error);
      bot.sendMessage(chatId, `❌ Error removing wallet: ${error.message}`);
    }
  },

  listWallets: async (bot, msg) => {
    const chatId = msg.chat.id;

    // Store chat ID for notifications
    // await storeChatId(chatId);

    try {
      // Get all tracked wallets
      // Get active tracked wallets only
      const wallets = await TrackedWallet.find({ isActive: true }).sort({ chain: 1 });

      // Get all chains for reference
      const chains = await Chain.find();

      // Format message
      const message = formatWalletList(wallets, chains);

      bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Error listing wallets:", error);
      bot.sendMessage(chatId, `❌ Error listing wallets: ${error.message}`);
    }
  },

  status: async (bot, msg) => {
    const chatId = msg.chat.id;
    console.log(`Status command called for chat ${chatId}`);

    try {
      // Simple status response for now
      const statusMessage = `*BOT STATUS*: 🟢 RUNNING

📊 *Quick Status*
✅ Bot is online and responding
⚡ Optimizations active
🔄 Processing requests

Use /help to see available commands`;

      console.log('Sending status response...');
      bot.sendMessage(chatId, statusMessage, { parse_mode: "Markdown" });
      return;

      // Get bot status (run queries in parallel for speed)
      const [
        botStatusConfig,
        chainCount,
        activeChainCount,
        walletCount,
        activeWalletCount,
        processedSwapCount,
        pendingSwapCount,
        failedSwapCount
      ] = await Promise.all([
        BotConfig.findOne({ setting: "botStatus" }),
        Chain.countDocuments(),
        Chain.countDocuments({ isActive: true }),
        TrackedWallet.countDocuments(),
        TrackedWallet.countDocuments({ isActive: true }),
        (async () => {
          try {
            const Swap = require("../db/models/swaps");
            return await Swap.countDocuments({ processed: true });
          } catch (e) { return 0; }
        })(),
        (async () => {
          try {
            const Swap = require("../db/models/swaps");
            return await Swap.countDocuments({
              processed: false,
              "status.code": "pending",
            });
          } catch (e) { return 0; }
        })(),
        (async () => {
          try {
            const Swap = require("../db/models/swaps");
            return await Swap.countDocuments({
              "status.code": "failed",
            });
          } catch (e) { return 0; }
        })()
      ]);

      const botStatus = botStatusConfig ? botStatusConfig.value : "stopped";

      // Format status message
      const statusData = {
        botStatus,
        chainCount,
        activeChainCount,
        walletCount,
        activeWalletCount,
        processedSwapCount,
        pendingSwapCount,
        failedSwapCount,
      };

      const message = formatBotStatus(statusData);

      // Cache status for 15 seconds for ultra-fast subsequent requests
      cache.set(statusCacheKey, message, 15000);

      bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Error getting status:", error);
      bot.sendMessage(chatId, `❌ Error getting status: ${error.message}`);
    }
  },

  balance: async (bot, msg, match) => {
    const chatId = msg.chat.id;

    // Store chat ID for notifications
    // await storeChatId(chatId);

    const chainId = match[1].trim().toLowerCase();

    try {
      const chain = await Chain.findOne({ chainId });

      if (!chain) {
        return bot.sendMessage(
          chatId,
          `⚠️ Chain '${chainId}' not supported. Use /list chains to see supported chains.`
        );
      }

      let balance;

      if (chain.type === "evm") {
        balance = await getEvmBalance(chain);
      } else if (chain.type === "solana") {
        balance = await getSolanaBalance();
      } else {
        return bot.sendMessage(
          chatId,
          `⚠️ Unsupported chain type: ${chain.type}`
        );
      }

      // Format balance message
      const message = formatWalletBalance(balance, chain);

      bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Error getting balance:", error);
      bot.sendMessage(chatId, `❌ Error getting balance: ${error.message}`);
    }
  },

  setChatId: async (bot, msg) => {
    const chatId = msg.chat.id;

    // Store chat ID for notifications
    await storeChatId(chatId);

    bot.sendMessage(
      chatId,
      `✅ Chat ID has been set to: ${chatId}\nBot will send notifications to this chat.`
    );
  },

  transactions: async (bot, msg, match) => {
    const chatId = msg.chat.id;

    try {
      const params = match[1].trim().split(" ");

      if (params.length < 2) {
        return bot.sendMessage(
          chatId,
          "⚠️ Invalid format. Use: /transactions <wallet_address> <chain>\n\nExample: /transactions 0x123...abc eth"
        );
      }

      const walletAddress = params[0];
      const chainId = params[1].toLowerCase();

      // Create cache key
      const cacheKey = `tx_${walletAddress}_${chainId}`;

      // Check cache first for ultra-fast response
      if (cache.has(cacheKey)) {
        const cachedMessage = cache.get(cacheKey);
        return bot.sendMessage(chatId, cachedMessage, {
          parse_mode: "Markdown",
          disable_web_page_preview: true
        });
      }

      // Validate chain (cache chains too)
      const chainCacheKey = `chain_${chainId}`;
      let chain;

      if (cache.has(chainCacheKey)) {
        chain = cache.get(chainCacheKey);
      } else {
        chain = await Chain.findOne({ chainId });
        if (chain) {
          cache.set(chainCacheKey, chain, 300000); // Cache chains for 5 minutes
        }
      }

      if (!chain) {
        return bot.sendMessage(
          chatId,
          `⚠️ Chain '${chainId}' not supported. Supported chains: eth, base, polygon, solana`
        );
      }

      // Send immediate response
      bot.sendMessage(chatId, `⚡ Fetching recent transactions for ${walletAddress} on ${chainId}...`);

      let transactions = [];

      if (chain.type === "evm") {
        transactions = await getEvmTransactions(walletAddress, chain, 10);
      } else if (chain.type === "solana") {
        transactions = await getSolanaTransactions(walletAddress, 10);
      } else {
        return bot.sendMessage(
          chatId,
          `⚠️ Unsupported chain type: ${chain.type}`
        );
      }

      const message = formatTransactionList(transactions, walletAddress);

      // Cache the result for 60 seconds for ultra-fast subsequent requests
      cache.set(cacheKey, message, 60000);

      bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
        disable_web_page_preview: true
      });

    } catch (error) {
      console.error("Error fetching transactions:", error);
      bot.sendMessage(chatId, `❌ Error fetching transactions: ${error.message}`);
    }
  },

  // Show transactions menu with tracked wallets
  showTransactionsMenu: async (bot, msg) => {
    const chatId = msg.chat.id;

    try {
      // Get all active tracked wallets
      const trackedWallets = await TrackedWallet.find({ isActive: true }).sort({ chain: 1, address: 1 });

      if (trackedWallets.length === 0) {
        return bot.sendMessage(chatId, `
🔍 *Check Recent Transactions*

❌ No tracked wallets found. Add wallets first using /add command.

*Manual usage:*
\`/transactions <wallet_address> <chain>\`

*Supported chains:*
• \`eth\` - Ethereum • \`base\` - Base • \`polygon\` - Polygon • \`solana\` - Solana

*Example:* \`/transactions 0x123...abc eth\`
        `, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "🔄 Back to Main Menu", callback_data: "menu_main" }
            ]]
          }
        });
      }

      // Group wallets by chain for better organization
      const walletsByChain = {};
      trackedWallets.forEach(wallet => {
        if (!walletsByChain[wallet.chain]) {
          walletsByChain[wallet.chain] = [];
        }
        walletsByChain[wallet.chain].push(wallet);
      });

      // Create inline keyboard with wallet buttons
      const keyboard = [];

      // Add wallet buttons grouped by chain
      Object.keys(walletsByChain).forEach(chain => {
        // Add chain header
        keyboard.push([{
          text: `📊 ${chain.toUpperCase()} Wallets`,
          callback_data: `chain_header_${chain}`
        }]);

        // Add wallet buttons for this chain
        walletsByChain[chain].forEach(wallet => {
          const shortAddress = `${wallet.address.substring(0, 6)}...${wallet.address.substring(wallet.address.length - 4)}`;
          const label = wallet.label ? ` (${wallet.label})` : '';

          keyboard.push([{
            text: `🔍 ${shortAddress}${label}`,
            callback_data: `tx_${wallet.address}_${wallet.chain}`
          }]);
        });
      });

      // Add manual input option and back button
      keyboard.push(
        [{ text: "✏️ Manual Input", callback_data: "tx_manual" }],
        [{ text: "🔄 Back to Main Menu", callback_data: "menu_main" }]
      );

      const message = `
🔍 *Check Recent Transactions*

Select a tracked wallet to view its recent transactions:

📊 *${trackedWallets.length} tracked wallet${trackedWallets.length !== 1 ? 's' : ''} available*

You can also use manual input for any wallet address.
      `;

      await bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard }
      });

    } catch (error) {
      console.error("Error showing transactions menu:", error);
      bot.sendMessage(chatId, `❌ Error loading wallets: ${error.message}`);
    }
  },

  // Menu callback handler
  handleMenuCallback: async (bot, callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    console.log(`🎯 Processing menu callback: "${data}" from chat ${chatId}`);

    switch (data) {
      case 'menu_main':
        // Show main menu
        await module.exports.start(bot, { chat: { id: chatId } });
        break;

      case 'menu_add':
        await bot.sendMessage(chatId, `
📝 *Add Wallet to Track*

To add a wallet, use the command:
\`/add <wallet_address> <chain>\`

*Supported chains:*
• \`eth\` - Ethereum
• \`base\` - Base
• \`polygon\` - Polygon  
• \`solana\` - Solana

*Example:*
\`/add 0x123...abc eth\`
        `, { parse_mode: "Markdown" });
        break;

      case 'menu_remove':
        await bot.sendMessage(chatId, `
🗑️ *Remove Wallet from Tracking*

To remove a wallet, use the command:
\`/remove <wallet_address> <chain>\`

*Example:*
\`/remove 0x123...abc eth\`
        `, { parse_mode: "Markdown" });
        break;

      case 'menu_list':
        await module.exports.listWallets(bot, { chat: { id: chatId } });
        break;

      case 'menu_status':
        await module.exports.status(bot, { chat: { id: chatId } });
        break;

      case 'menu_balance':
        await bot.sendMessage(chatId, `
💰 *Check Wallet Balance*

To check your wallet balance on a specific chain:
\`/balance <chain>\`

*Supported chains:*
• \`eth\` - Ethereum
• \`base\` - Base  
• \`polygon\` - Polygon
• \`solana\` - Solana

*Example:*
\`/balance eth\`
        `, { parse_mode: "Markdown" });
        break;

      case 'menu_transactions':
        await module.exports.showTransactionsMenu(bot, { chat: { id: chatId } });
        break;

      case 'menu_help':
        await module.exports.help(bot, { chat: { id: chatId } });
        break;

      case 'menu_sniping':
        await module.exports.showSnipingMenu(bot, { chat: { id: chatId } });
        break;

      case 'menu_snipe_stats':
        await module.exports.showSnipeStats(bot, { chat: { id: chatId } });
        break;

      case 'snipe_add_help':
        await bot.sendMessage(chatId, `
➕ *Add Snipe Target*

To add a token to snipe, use:
\`/snipe_add <token_address> <sol_amount> [max_slippage]\`

*Parameters:*
• token_address: Solana token mint address (44 characters)
• sol_amount: Amount of SOL to spend (minimum 0.001)
• max_slippage: Maximum slippage % (optional, default 15%)

*Example:*
\`/snipe_add So11111111111111111111111111111111111111112 0.1 15\`

This will snipe 0.1 SOL worth of the token with max 15% slippage.
        `, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "🔄 Back to Sniping Menu", callback_data: "menu_sniping" }
            ]]
          }
        });
        break;

      case 'snipe_list':
        await module.exports.snipeList(bot, { chat: { id: chatId } });
        break;

      case 'snipe_history':
        await module.exports.showSnipeHistory(bot, { chat: { id: chatId } });
        break;

      case 'snipe_stats':
        await module.exports.showSnipeStats(bot, { chat: { id: chatId } });
        break;

      case 'snipe_help':
        await bot.sendMessage(chatId, `
🎯 *Solana Sniping Bot Help*

*Available Commands:*
• \`/snipe_add <token> <sol> [slippage]\` - Add snipe target
• \`/snipe_remove <token>\` - Remove target  
• \`/snipe_list\` - List active targets
• \`/snipe_pause\` - Pause all sniping
• \`/snipe_resume\` - Resume sniping
• \`/snipe_stats\` - View statistics

*How It Works:*
1. Add tokens you want to snipe with /snipe_add
2. Bot monitors Solana for new liquidity pools
3. When your target token gets liquidity, bot executes the trade
4. You get notified of results instantly

*Settings:*
• Min Amount: 0.001 SOL
• Max Slippage: 0.5% - 50%
• Priority Fee: 0.01 SOL (configurable)
• Execution Speed: ~200ms target

*Safety:*
• Balance verification before execution
• Slippage protection
• Comprehensive error handling
        `, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "🔄 Back to Sniping Menu", callback_data: "menu_sniping" }
            ]]
          }
        });
        break;

      case 'tx_manual':
        await bot.sendMessage(chatId, `
✏️ *Manual Transaction Lookup*

To check recent transactions for any wallet:
\`/transactions <wallet_address> <chain>\`

*Supported chains:*
• \`eth\` - Ethereum
• \`base\` - Base  
• \`polygon\` - Polygon
• \`solana\` - Solana

*Example:*
\`/transactions 0x123...abc eth\`

This will show the 10 most recent transactions with timestamps, values, and explorer links.
        `, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "🔄 Back to Transactions Menu", callback_data: "menu_transactions" },
              { text: "🏠 Main Menu", callback_data: "menu_main" }
            ]]
          }
        });
        break;

      default:
        // Handle wallet transaction requests (tx_address_chain format)
        if (data.startsWith('tx_') && !data.includes('manual') && !data.includes('chain_header')) {
          const parts = data.split('_');
          if (parts.length >= 3) {
            const address = parts.slice(1, -1).join('_'); // Handle addresses with underscores
            const chain = parts[parts.length - 1];

            console.log(`Fetching transactions for ${address} on ${chain}`);

            // Create a mock match object for the transactions function
            const mockMatch = [`/transactions ${address} ${chain}`, `${address} ${chain}`];
            await module.exports.transactions(bot, { chat: { id: chatId } }, mockMatch);
          }
        } else if (data.startsWith('chain_header_')) {
          // Just answer the callback for chain headers (they're not clickable actions)
          // No additional action needed
        } else {
          await bot.sendMessage(chatId, "Unknown menu option. Please try again.");
        }
    }
  },
};

const formatWalletList = (wallets, chains) => {
  if (wallets.length === 0) {
    return "📝 You're not tracking any wallets yet. Use /add or /add_dev to start tracking.";
  }

  // Separate wallets by role
  const copyWallets = wallets.filter(w => !w.role || w.role === 'copy_trading');
  const devWallets = wallets.filter(w => w.role === 'dev_sniper');

  let message = "";

  // 1. Dev Sniper Wallets (Priority)
  if (devWallets.length > 0) {
    message += "🎯 *Dev Sniper Wallets (New Token Detection):*\n";
    devWallets.forEach((wallet) => {
      const status = wallet.isActive ? "✅" : "zzz";
      message += `${status} \`${wallet.address}\`\n`;
    });
    message += "\n";
  }

  // 2. Copy Trading Wallets
  if (copyWallets.length > 0) {
    message += "📋 *Copy Trading Wallets:*\n";

    // Group by chain
    const walletsByChain = {};
    copyWallets.forEach((wallet) => {
      if (!walletsByChain[wallet.chain]) walletsByChain[wallet.chain] = [];
      walletsByChain[wallet.chain].push(wallet);
    });

    for (const chain in walletsByChain) {
      const chainInfo = chains.find((c) => c.chainId === chain);
      message += `*${chainInfo ? chainInfo.name : chain}:*\n`;
      walletsByChain[chain].forEach((wallet) => {
        const label = wallet.label ? ` (${wallet.label})` : "";
        const status = wallet.isActive ? "" : " (Inactive)";
        message += `- \`${wallet.address}\`${label}${status}\n`;
      });
      message += "\n";
    }
  }

  return message;
};

// Dev Wallet Management Handlers
module.exports.addDevWallet = async (bot, msg, match) => {
  const chatId = msg.chat.id;
  try {
    const address = match[1].trim();

    // Basic Solana address validation (base58)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      return bot.sendMessage(chatId, "⚠️ Invalid Solana address format.");
    }

    // Check if exists
    let wallet = await TrackedWallet.findOne({ address: address });

    if (wallet) {
      if (wallet.role === 'dev_sniper' && wallet.isActive) {
        return bot.sendMessage(chatId, `⚠️ Wallet ${address} is already being tracked as a Dev Sniper.`);
      }
      // Update role if it was different or inactive
      wallet.role = 'dev_sniper';
      wallet.isActive = true;
      await wallet.save();
    } else {
      // Create new
      wallet = new TrackedWallet({
        address: address,
        chain: 'solana', // Dev sniping is Solana only for now
        role: 'dev_sniper',
        isActive: true,
        addedBy: chatId.toString()
      });
      await wallet.save();
    }

    // Trigger monitoring update immediately
    const mintDetector = require("../services/sniping/mintDetector");
    mintDetector.subscribeToWallet(address);

    bot.sendMessage(chatId, `✅ *Dev Sniper Wallet Added*\n\nBot is now tracking \`${address}\` for new token creations and pool initializations.`, { parse_mode: "Markdown" });

  } catch (error) {
    console.error("Error adding dev wallet:", error);
    bot.sendMessage(chatId, `❌ Error adding dev wallet: ${error.message}`);
  }
};

module.exports.removeDevWallet = async (bot, msg, match) => {
  const chatId = msg.chat.id;
  try {
    const address = match[1].trim();

    const wallet = await TrackedWallet.findOne({ address: address, role: 'dev_sniper' });

    if (!wallet) {
      return bot.sendMessage(chatId, `⚠️ Wallet ${address} is not tracked as a Dev Sniper.`);
    }

    // Hard delete
    await TrackedWallet.deleteOne({ address: address, role: 'dev_sniper' });

    // Stop monitoring
    const mintDetector = require("../services/sniping/mintDetector");
    mintDetector.unsubscribeFromWallet(address);

    bot.sendMessage(chatId, `✅ Stopped tracking dev wallet \`${address}\`.`, { parse_mode: "Markdown" });

  } catch (error) {
    console.error("Error removing dev wallet:", error);
    bot.sendMessage(chatId, `❌ Error removing dev wallet: ${error.message}`);
  }
};

// Sniping command handlers
module.exports.snipeAdd = async (bot, msg, match) => {
  const chatId = msg.chat.id;
  const userId = chatId.toString();

  console.log(`🎯 Processing snipe_add command from user ${userId}`);
  console.log(`📝 Match data:`, match);

  try {
    if (!match || !match[1]) {
      console.log("❌ No parameters provided");
      return bot.sendMessage(chatId, "⚠️ No parameters provided. Use: /snipe_add <token_address> <sol_amount> [max_slippage]");
    }

    const params = match[1].trim().split(" ");
    console.log(`📊 Parsed parameters:`, params);

    if (params.length < 2) {
      console.log("❌ Insufficient parameters");
      return bot.sendMessage(
        chatId,
        "⚠️ Invalid format. Use: /snipe_add <token_address> <sol_amount> [max_slippage]\n\n" +
        "Example: `/snipe_add So11111111111111111111111111111111111111112 0.1 15`\n\n" +
        "Parameters:\n" +
        "• token_address: Solana token mint address\n" +
        "• sol_amount: Amount of SOL to spend (minimum 0.001)\n" +
        "• max_slippage: Maximum slippage % (optional, default 15%)",
        { parse_mode: "Markdown" }
      );
    }

    const tokenAddress = params[0];
    const targetAmount = parseFloat(params[1]);
    const maxSlippage = params.length > 2 ? parseFloat(params[2]) : 15.0;

    console.log(`🔍 Validating: token=${tokenAddress}, amount=${targetAmount}, slippage=${maxSlippage}`);

    // Validation
    if (isNaN(targetAmount) || targetAmount < 0.001) {
      console.log("❌ Invalid amount validation failed");
      return bot.sendMessage(chatId, "⚠️ Invalid amount. Minimum is 0.001 SOL");
    }

    if (isNaN(maxSlippage) || maxSlippage < 0.5 || maxSlippage > 50) {
      console.log("❌ Invalid slippage validation failed");
      return bot.sendMessage(chatId, "⚠️ Invalid slippage. Must be between 0.5% and 50%");
    }

    console.log("✅ Validation passed, checking for existing targets...");

    // Check if target already exists
    const existingTarget = await SnipeTarget.getTargetByToken(tokenAddress, userId);
    if (existingTarget) {
      console.log("⚠️ Target already exists");
      return bot.sendMessage(
        chatId,
        `⚠️ Already have an active snipe target for this token.\n` +
        `Current target: ${existingTarget.targetAmount} SOL with ${existingTarget.maxSlippage}% slippage\n\n` +
        `Use /snipe_remove first to replace it.`
      );
    }

    console.log("✅ No existing target, creating new snipe target...");

    // Create snipe target
    const target = new SnipeTarget({
      userId: userId,
      tokenAddress: tokenAddress,
      targetAmount: targetAmount,
      maxSlippage: maxSlippage,
      isActive: true,
      snipeStatus: "pending",
      autoSell: {
        enabled: true,
        takeProfitPercent: 100,
        stopLossPercent: 50
      }
    });

    console.log("💾 Saving snipe target to database...");
    await target.save();
    console.log(`✅ Snipe target saved with ID: ${target._id}`);

    bot.sendMessage(
      chatId,
      `✅ *Snipe Target Added*\n\n` +
      `🎯 Token: \`${tokenAddress}\`\n` +
      `💰 Amount: ${targetAmount} SOL\n` +
      `📊 Max Slippage: ${maxSlippage}%\n` +
      `⚡ Priority Fee: ${target.priorityFee} SOL\n\n` +
      `🔍 Bot will monitor for liquidity and execute when conditions are met.`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("❌ Error adding snipe target:", error);
    bot.sendMessage(chatId, `❌ Error adding snipe target: ${error.message}`);
  }
};

module.exports.snipeRemove = async (bot, msg, match) => {
  const chatId = msg.chat.id;
  const userId = chatId.toString();

  try {
    const tokenAddress = match[1].trim();

    if (!tokenAddress) {
      return bot.sendMessage(
        chatId,
        "⚠️ Invalid format. Use: /snipe_remove <token_address>\n\n" +
        "Example: `/snipe_remove So11111111111111111111111111111111111111112`",
        { parse_mode: "Markdown" }
      );
    }

    const target = await SnipeTarget.getTargetByToken(tokenAddress, userId);

    if (!target) {
      return bot.sendMessage(
        chatId,
        `⚠️ No active snipe target found for token: \`${tokenAddress}\``,
        { parse_mode: "Markdown" }
      );
    }

    // Mark as cancelled
    target.snipeStatus = "cancelled";
    target.isActive = false;
    await target.save();

    bot.sendMessage(
      chatId,
      `✅ *Snipe Target Removed*\n\n` +
      `🎯 Token: \`${tokenAddress}\`\n` +
      `💰 Amount: ${target.targetAmount} SOL\n` +
      `📊 Status: Cancelled`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Error removing snipe target:", error);
    bot.sendMessage(chatId, `❌ Error removing snipe target: ${error.message}`);
  }
};

module.exports.snipeList = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = chatId.toString();

  try {
    const targets = await SnipeTarget.getActiveTargets(userId);

    if (targets.length === 0) {
      return bot.sendMessage(
        chatId,
        `📋 *No Active Snipe Targets*\n\n` +
        `Use /snipe_add to create your first snipe target.\n\n` +
        `*Example:*\n\`/snipe_add <token_address> 0.1 15\``,
        { parse_mode: "Markdown" }
      );
    }

    let message = `🎯 *Active Snipe Targets* (${targets.length})\n\n`;

    for (const target of targets) {
      const statusIcon = target.snipeStatus === "pending" ? "⏳" :
        target.snipeStatus === "paused" ? "⏸️" : "❓";

      message += `${statusIcon} **Target ${targets.indexOf(target) + 1}**\n`;
      message += `🪙 Token: \`${target.tokenAddress.substring(0, 20)}...\`\n`;
      message += `💰 Amount: ${target.targetAmount} SOL\n`;
      message += `📊 Max Slippage: ${target.maxSlippage}%\n`;
      message += `⚡ Priority Fee: ${target.priorityFee} SOL\n`;
      message += `📅 Created: ${target.createdAt.toLocaleDateString()}\n`;
      message += `🔄 Status: ${target.snipeStatus}\n\n`;
    }

    message += `\n*Commands:*\n`;
    message += `• /snipe_remove <token_address> - Remove target\n`;
    message += `• /snipe_pause - Pause all sniping\n`;
    message += `• /snipe_resume - Resume sniping`;

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error listing snipe targets:", error);
    bot.sendMessage(chatId, `❌ Error listing snipe targets: ${error.message}`);
  }
};

module.exports.snipePause = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = chatId.toString();

  try {
    const targets = await SnipeTarget.getActiveTargets(userId);

    if (targets.length === 0) {
      return bot.sendMessage(chatId, "⚠️ No active snipe targets to pause.");
    }

    // Pause all targets
    const updateResult = await SnipeTarget.updateMany(
      { userId: userId, isActive: true, snipeStatus: "pending" },
      { snipeStatus: "paused", isActive: false }
    );

    bot.sendMessage(
      chatId,
      `⏸️ *Sniping Paused*\n\n` +
      `📊 Paused ${updateResult.modifiedCount} snipe target(s)\n\n` +
      `Use /snipe_resume to resume sniping.`
    );
  } catch (error) {
    console.error("Error pausing snipe targets:", error);
    bot.sendMessage(chatId, `❌ Error pausing snipe targets: ${error.message}`);
  }
};

module.exports.snipeResume = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = chatId.toString();

  try {
    const pausedTargets = await SnipeTarget.find({
      userId: userId,
      snipeStatus: "paused"
    });

    if (pausedTargets.length === 0) {
      return bot.sendMessage(chatId, "⚠️ No paused snipe targets to resume.");
    }

    // Resume all paused targets
    const updateResult = await SnipeTarget.updateMany(
      { userId: userId, snipeStatus: "paused" },
      { snipeStatus: "pending", isActive: true }
    );

    bot.sendMessage(
      chatId,
      `▶️ *Sniping Resumed*\n\n` +
      `📊 Resumed ${updateResult.modifiedCount} snipe target(s)\n\n` +
      `Bot will now monitor for opportunities.`
    );
  } catch (error) {
    console.error("Error resuming snipe targets:", error);
    bot.sendMessage(chatId, `❌ Error resuming snipe targets: ${error.message}`);
  }
};

module.exports.showSnipeStats = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = chatId.toString();

  try {
    // Get execution statistics
    const stats = await SnipeExecution.getExecutionStats(userId, 30);
    const recentExecutions = await SnipeExecution.getRecentExecutions(userId, 5);
    const activeTargets = await SnipeTarget.getActiveTargets(userId);

    let message = `📊 *Sniping Statistics* (Last 30 days)\n\n`;

    // Overall stats
    const totalExecutions = stats.reduce((sum, stat) => sum + stat.count, 0);
    const successfulExecutions = stats.find(s => s._id === "success")?.count || 0;
    const failedExecutions = stats.find(s => s._id === "failed")?.count || 0;
    const successRate = totalExecutions > 0 ? ((successfulExecutions / totalExecutions) * 100).toFixed(1) : 0;

    message += `🎯 **Active Targets:** ${activeTargets.length}\n`;
    message += `🔄 **Total Executions:** ${totalExecutions}\n`;
    message += `✅ **Successful:** ${successfulExecutions}\n`;
    message += `❌ **Failed:** ${failedExecutions}\n`;
    message += `📈 **Success Rate:** ${successRate}%\n\n`;

    // Performance metrics
    if (stats.length > 0) {
      const avgExecutionTime = stats.reduce((sum, stat) => sum + (stat.avgExecutionTime || 0), 0) / stats.length;
      const avgSlippage = stats.reduce((sum, stat) => sum + (stat.avgSlippage || 0), 0) / stats.length;
      const totalSpent = stats.reduce((sum, stat) => sum + (stat.totalAmountIn || 0), 0);

      message += `⚡ **Avg Execution Time:** ${Math.round(avgExecutionTime)}ms\n`;
      message += `📊 **Avg Slippage:** ${avgSlippage.toFixed(2)}%\n`;
      message += `💰 **Total SOL Spent:** ${totalSpent.toFixed(4)}\n\n`;
    }

    // Recent executions
    if (recentExecutions.length > 0) {
      message += `🕒 **Recent Executions:**\n`;
      for (const execution of recentExecutions.slice(0, 3)) {
        const statusIcon = execution.status === "success" ? "✅" : "❌";
        const timeAgo = Math.floor((Date.now() - execution.createdAt) / (1000 * 60));
        message += `${statusIcon} ${execution.tokenSymbol} - ${timeAgo}m ago\n`;
      }
    } else {
      message += `📭 No recent executions found.\n`;
    }

    message += `\n*Use /snipe_add to create new targets.*`;

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error getting snipe stats:", error);
    bot.sendMessage(chatId, `❌ Error getting snipe statistics: ${error.message}`);
  }
};

module.exports.showSnipeHistory = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = chatId.toString();

  try {
    const history = await SnipeExecution.getRecentExecutions(userId, 10);

    if (history.length === 0) {
      return bot.sendMessage(chatId, "📜 *Snipe History*\n\n📭 No sniping history found.", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "🔄 Sniping Menu", callback_data: "menu_sniping" }]]
        }
      });
    }

    let message = `📜 *Snipe History* (Last 10)\n\n`;

    history.forEach((exec, index) => {
      const statusIcon = exec.status === "success" ? "✅" : exec.status === "failed" ? "❌" : "⏳";
      const date = new Date(exec.createdAt).toLocaleString();
      const amountStr = exec.amountIn ? exec.amountIn.toFixed(4) : "0.0000";

      message += `${index + 1}. ${statusIcon} *${exec.tokenSymbol}*\n`;
      message += `   └ 📅 ${date}\n`;
      message += `   └ 💵 Amount: ${amountStr} SOL\n`;

      if (exec.status === "success") {
        const pnl = exec.profitLoss?.unrealizedPnL || 0;
        const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";
        message += `   └ ${pnlEmoji} PnL: ${pnl.toFixed(4)} SOL\n`;
      } else if (exec.status === "failed") {
        message += `   └ 🚨 Error: ${exec.errorDetails?.errorCode || "Unknown"}\n`;
      }
      message += `\n`;
    });

    bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🔄 Back to Sniping Menu", callback_data: "menu_sniping" }]]
      }
    });

  } catch (error) {
    console.error("Error showing snipe history:", error);
    bot.sendMessage(chatId, `❌ Error loading history: ${error.message}`);
  }
};

module.exports.showSnipingMenu = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = chatId.toString();

  try {
    const activeTargets = await SnipeTarget.getActiveTargets(userId);
    const recentExecutions = await SnipeExecution.getRecentExecutions(userId, 3);

    const message = `
🎯 *Solana Sniping Bot*

**Current Status:**
📊 Active Targets: ${activeTargets.length}
📈 Recent Executions: ${recentExecutions.length}

**Quick Actions:**
    `;

    const keyboard = [
      [
        { text: "➕ Add Target", callback_data: "snipe_add_help" },
        { text: "📋 List Targets", callback_data: "snipe_list" }
      ],
      [
        { text: "📜 Snipe History", callback_data: "snipe_history" },
        { text: "📊 Statistics", callback_data: "snipe_stats" }
      ],
      [
        { text: "❓ Snipe Help", callback_data: "snipe_help" },
        { text: "🔄 Main Menu", callback_data: "menu_main" }
      ]
    ];

    bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error("Error showing sniping menu:", error);
    bot.sendMessage(chatId, `❌ Error loading sniping menu: ${error.message}`);
  }
};
