// src/telegram/commands/settings.js
const marketCapFilter = require("../../services/sniping/marketCapFilter");
const fastExecutor = require("../../services/sniping/fastExecutor");
const TrackedWallet = require("../../db/models/trackedWallets");

/**
 * Settings Command - Main configuration menu
 */
async function handleSettingsCommand(bot, chatId) {
    const keyboard = {
        inline_keyboard: [
            [
                { text: "📊 Market Cap Filter", callback_data: "settings_mcap" },
                { text: "🎯 TP/SL Config", callback_data: "settings_tpsl" }
            ],
            [
                { text: "⚡ Fast Executor Stats", callback_data: "settings_fast_stats" },
                { text: "👨‍💻 Developer Wallets", callback_data: "settings_devs" }
            ],
            [
                { text: "🔧 Auto-Snipe Settings", callback_data: "settings_snipe" }
            ],
            [
                { text: "❌ Close", callback_data: "settings_close" }
            ]
        ]
    };

    const message = `⚙️ *Settings & Configuration*\n\n` +
        `Select a category to view or modify settings:`;

    await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
}

/**
 * Market Cap Filter Settings
 */
async function handleMarketCapSettings(bot, chatId, messageId = null) {
    const config = marketCapFilter.getConfig();
    const isEnabled = process.env.AUTO_SNIPE_MCAP_FILTER === 'true';

    const keyboard = {
        inline_keyboard: [
            [
                { text: isEnabled ? "✅ Enabled" : "❌ Disabled", callback_data: "mcap_toggle" }
            ],
            [
                { text: `Min: $${config.targetMin.toLocaleString()}`, callback_data: "mcap_set_min" },
                { text: `Max: $${config.targetMax.toLocaleString()}`, callback_data: "mcap_set_max" }
            ],
            [
                { text: "🔧 Presets", callback_data: "mcap_presets" }
            ],
            [
                { text: "« Back", callback_data: "settings_main" }
            ]
        ]
    };

    const message = `📊 *Market Cap Filter Configuration*\n\n` +
        `Status: ${isEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
        `Range: $${config.targetMin.toLocaleString()} - $${config.targetMax.toLocaleString()}\n` +
        `Cache: ${config.cacheSize} entries\n\n` +
        `The bot will only snipe tokens within this market cap range.`;

    if (messageId) {
        await bot.editMessageText(message, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    } else {
        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
}

/**
 * Market Cap Presets
 */
async function handleMarketCapPresets(bot, chatId, messageId) {
    const keyboard = {
        inline_keyboard: [
            [
                { text: "🎯 Micro ($1K - $10K)", callback_data: "mcap_preset_micro" }
            ],
            [
                { text: "📈 Small ($10K - $50K)", callback_data: "mcap_preset_small" }
            ],
            [
                { text: "🚀 Medium ($50K - $200K)", callback_data: "mcap_preset_medium" }
            ],
            [
                { text: "💎 Large ($200K - $1M)", callback_data: "mcap_preset_large" }
            ],
            [
                { text: "« Back", callback_data: "settings_mcap" }
            ]
        ]
    };

    const message = `🔧 *Market Cap Presets*\n\n` +
        `Choose a preset range or go back to set custom values:`;

    await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
}

/**
 * TP/SL Settings
 */
async function handleTPSLSettings(bot, chatId, messageId = null) {
    const tp = parseInt(process.env.AUTO_SNIPE_TP) || 75;
    const sl = parseInt(process.env.AUTO_SNIPE_SL) || 20;

    const keyboard = {
        inline_keyboard: [
            [
                { text: `TP: ${tp}%`, callback_data: "tpsl_set_tp" },
                { text: `SL: ${sl}%`, callback_data: "tpsl_set_sl" }
            ],
            [
                { text: "🎯 Conservative (50%/10%)", callback_data: "tpsl_preset_conservative" }
            ],
            [
                { text: "⚖️ Balanced (75%/20%)", callback_data: "tpsl_preset_balanced" }
            ],
            [
                { text: "🚀 Aggressive (150%/30%)", callback_data: "tpsl_preset_aggressive" }
            ],
            [
                { text: "« Back", callback_data: "settings_main" }
            ]
        ]
    };

    const message = `🎯 *Take Profit & Stop Loss Configuration*\n\n` +
        `Current Settings:\n` +
        `• Take Profit: ${tp}%\n` +
        `• Stop Loss: ${sl}%\n\n` +
        `Example with 0.01 SOL purchase:\n` +
        `✅ Sell at +${tp}% → ~${(0.01 * (1 + tp / 100)).toFixed(4)} SOL\n` +
        `❌ Sell at -${sl}% → ~${(0.01 * (1 - sl / 100)).toFixed(4)} SOL`;

    if (messageId) {
        await bot.editMessageText(message, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    } else {
        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
}

/**
 * Fast Executor Stats
 */
async function handleFastExecutorStats(bot, chatId, messageId = null) {
    let stats;
    let isInitialized = false;

    try {
        await fastExecutor.initialize();
        stats = fastExecutor.getStats();
        isInitialized = true;
    } catch (error) {
        stats = { cachedTransactions: 0, currentPriorityFee: 0, recentFeeSamples: 0 };
    }

    const keyboard = {
        inline_keyboard: [
            [
                { text: "🔄 Refresh", callback_data: "settings_fast_stats" }
            ],
            [
                { text: "« Back", callback_data: "settings_main" }
            ]
        ]
    };

    const rpcUrl = process.env.SOLANA_RPC_URL || "Not configured";
    const isPremium = rpcUrl.includes("helius") || rpcUrl.includes("quicknode") || rpcUrl.includes("triton");

    const message = `⚡ *Fast Executor Performance*\n\n` +
        `Status: ${isInitialized ? '✅ Active' : '❌ Inactive'}\n` +
        `RPC: ${isPremium ? '✅ Premium' : '⚠️ Public'}\n\n` +
        `📊 Statistics:\n` +
        `• Cached TX: ${stats.cachedTransactions}\n` +
        `• Priority Fee: ${stats.currentPriorityFee} µL\n` +
        `• Fee Samples: ${stats.recentFeeSamples}\n\n` +
        `Expected Latency: ${isPremium ? '150-300ms' : '>1000ms'}`;

    if (messageId) {
        await bot.editMessageText(message, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    } else {
        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
}

/**
 * Developer Wallets Management
 */
const userAwaitingDevAddress = new Map(); // Store users waiting to input address

async function handleDeveloperWallets(bot, chatId, messageId = null) {
    try {
        // Get active tracked wallets
        const wallets = await TrackedWallet.find({ chain: 'solana', role: 'dev_sniper', isActive: true });

        const keyboard = {
            inline_keyboard: [
                [
                    { text: "➕ Add Developer Address", callback_data: "devs_add" }
                ],
                ...(wallets.length > 0 ? [
                    [
                        { text: "📋 View All Wallets", callback_data: "devs_list" },
                        { text: "🗑️ Remove Wallet", callback_data: "devs_remove" }
                    ]
                ] : []),
                [
                    { text: "« Back", callback_data: "settings_main" }
                ]
            ]
        };

        const message = `👨‍💻 *Developer Wallet Management*\n\n` +
            `Tracked Wallets: ${wallets.length}\n\n` +
            `🎯 *Purpose:*\n` +
            `Monitor developer wallets to auto-snipe new tokens when they create or add liquidity.\n\n` +
            `✅ *Active Tracking:* ${wallets.filter(w => w.isActive).length}/${wallets.length}`;

        if (messageId) {
            await bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } else {
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
    } catch (error) {
        console.error("Error in handleDeveloperWallets:", error);
        await bot.sendMessage(chatId, `❌ Error: ${error.message}`, { parse_mode: 'HTML' });
    }
}

async function handleDeveloperWalletsList(bot, chatId, messageId) {
    try {
        const wallets = await TrackedWallet.find({ chain: 'solana', role: 'dev_sniper', isActive: true }).limit(10);

        if (wallets.length === 0) {
            await bot.editMessageText(
                `📋 *Developer Wallets List*\n\nNo wallets tracked yet.\n\nUse "Add Developer Address" to start monitoring wallets.`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: "« Back", callback_data: "settings_devs" }]]
                    }
                }
            );
            return;
        }

        let message = `📋 *Developer Wallets List*\n\n`;

        wallets.forEach((wallet, index) => {
            message += `${index + 1}. \`${wallet.address.substring(0, 8)}...${wallet.address.substring(wallet.address.length - 6)}\`\n`;
            message += `   • Status: ${wallet.isActive ? '✅ Active' : '❌ Inactive'}\n`;
            if (wallet.walletName) {
                message += `   • Name: ${wallet.walletName}\n`;
            }
            message += `\n`;
        });

        message += `\n_Showing ${Math.min(wallets.length, 10)} wallets_`;

        await bot.editMessageText(message, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: "« Back", callback_data: "settings_devs" }]]
            }
        });
    } catch (error) {
        console.error("Error listing developer wallets:", error);
    }
}

async function handleDeveloperWalletsRemove(bot, chatId, messageId) {
    try {
        const wallets = await TrackedWallet.find({ chain: 'solana', role: 'dev_sniper', isActive: true }).limit(10);

        if (wallets.length === 0) {
            await bot.editMessageText(
                `🗑️ *Remove Developer Wallet*\n\nNo wallets to remove.`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: "« Back", callback_data: "settings_devs" }]]
                    }
                }
            );
            return;
        }

        const keyboard = {
            inline_keyboard: [
                ...wallets.map(wallet => [{
                    text: `🗑️ ${wallet.address.substring(0, 12)}...${wallet.address.substring(wallet.address.length - 4)}`,
                    callback_data: `devs_remove_${wallet.address}`
                }]),
                [{ text: "« Back", callback_data: "settings_devs" }]
            ]
        };

        await bot.editMessageText(
            `🗑️ *Remove Developer Wallet*\n\nSelect a wallet to remove:`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }
        );
    } catch (error) {
        console.error("Error in remove wallet view:", error);
    }
}

async function confirmRemoveWallet(bot, chatId, messageId, walletAddress) {
    try {
        await TrackedWallet.deleteOne({ address: walletAddress, chain: 'solana' });

        await bot.editMessageText(
            `✅ *Wallet Removed*\n\n\`${walletAddress.substring(0, 12)}...${walletAddress.substring(walletAddress.length - 8)}\`\n\nThis wallet is no longer being monitored for new tokens.`,
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: "« Back to Developer Wallets", callback_data: "settings_devs" }]]
                }
            }
        );
    } catch (error) {
        console.error("Error removing wallet:", error);
    }
}

/** 
 * Callback Query Handler for Settings
 */
async function handleSettingsCallback(bot, query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.callback_data;

    try {
        switch (data) {
            case "settings_mcap":
                await handleMarketCapSettings(bot, chatId, messageId);
                break;

            case "settings_tpsl":
                await handleTPSLSettings(bot, chatId, messageId);
                break;

            case "settings_fast_stats":
                await handleFastExecutorStats(bot, chatId, messageId);
                break;

            case "settings_devs":
                await handleDeveloperWallets(bot, chatId, messageId);
                break;

            case "devs_list":
                await handleDeveloperWalletsList(bot, chatId, messageId);
                break;

            case "devs_remove":
                await handleDeveloperWalletsRemove(bot, chatId, messageId);
                break;

            case "devs_add":
                userAwaitingDevAddress.set(chatId, true);
                await bot.sendMessage(chatId, "👨‍💻 *Add Developer Wallet*\n\nPlease reply with the Solana address you want to track for sniping.\n\n_Example: 5Q544fKr..._", {
                    parse_mode: 'Markdown',
                    reply_markup: { force_reply: true }
                });
                await bot.answerCallbackQuery(query.id);
                break;

            case "settings_main":
                await handleSettingsCommand(bot, chatId);
                await bot.deleteMessage(chatId, messageId);
                break;

            case "settings_close":
                await bot.deleteMessage(chatId, messageId);
                break;

            case "mcap_toggle":
                // This would require writing to .env - for now just show instruction
                await bot.answerCallbackQuery(query.id, {
                    text: "Set AUTO_SNIPE_MCAP_FILTER=true in your .env file",
                    show_alert: true
                });
                break;

            case "mcap_presets":
                await handleMarketCapPresets(bot, chatId, messageId);
                break;

            case "mcap_preset_micro":
                marketCapFilter.setTargetRange(1000, 10000);
                await bot.answerCallbackQuery(query.id, { text: "✅ Range set to $1K - $10K" });
                await handleMarketCapSettings(bot, chatId, messageId);
                break;

            case "mcap_preset_small":
                marketCapFilter.setTargetRange(10000, 50000);
                await bot.answerCallbackQuery(query.id, { text: "✅ Range set to $10K - $50K" });
                await handleMarketCapSettings(bot, chatId, messageId);
                break;

            case "mcap_preset_medium":
                marketCapFilter.setTargetRange(50000, 200000);
                await bot.answerCallbackQuery(query.id, { text: "✅ Range set to $50K - $200K" });
                await handleMarketCapSettings(bot, chatId, messageId);
                break;

            case "mcap_preset_large":
                marketCapFilter.setTargetRange(200000, 1000000);
                await bot.answerCallbackQuery(query.id, { text: "✅ Range set to $200K - $1M" });
                await handleMarketCapSettings(bot, chatId, messageId);
                break;

            case "tpsl_preset_conservative":
                process.env.AUTO_SNIPE_TP = "50";
                process.env.AUTO_SNIPE_SL = "10";
                await bot.answerCallbackQuery(query.id, { text: "✅ Set to Conservative (50%/10%)" });
                await handleTPSLSettings(bot, chatId, messageId);
                break;

            case "tpsl_preset_balanced":
                process.env.AUTO_SNIPE_TP = "75";
                process.env.AUTO_SNIPE_SL = "20";
                await bot.answerCallbackQuery(query.id, { text: "✅ Set to Balanced (75%/20%)" });
                await handleTPSLSettings(bot, chatId, messageId);
                break;

            case "tpsl_preset_aggressive":
                process.env.AUTO_SNIPE_TP = "150";
                process.env.AUTO_SNIPE_SL = "30";
                await bot.answerCallbackQuery(query.id, { text: "✅ Set to Aggressive (150%/30%)" });
                await handleTPSLSettings(bot, chatId, messageId);
                break;

            default:
                if (data.startsWith("devs_remove_")) {
                    const address = data.replace("devs_remove_", "");
                    await confirmRemoveWallet(bot, chatId, messageId, address);
                } else {
                    await bot.answerCallbackQuery(query.id);
                }
        }
    } catch (error) {
        console.error("Error handling settings callback:", error);
        await bot.answerCallbackQuery(query.id, {
            text: "❌ Error: " + error.message,
            show_alert: true
        });
    }
}

module.exports = {
    handleSettingsCommand,
    handleMarketCapSettings,
    handleTPSLSettings,
    handleFastExecutorStats,
    handleSettingsCallback,
    userAwaitingDevAddress
};
