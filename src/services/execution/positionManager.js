// src/services/execution/positionManager.js
const axios = require("axios");
const SnipeTarget = require("../../db/models/snipeTargets");
const UserWallet = require("../../db/models/userWallets");
const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58").default || require("bs58");
const { executeJupiterSwap } = require("./jupiterSwap");
const { sendMessage } = require("../../utils/notifier");
const { getTokenMetadata } = require("../moralis/tokenMetadata");

class PositionManager {
    constructor() {
        this.isRunning = false;
        this.monitoringInterval = null;
        this.checkFrequency = parseInt(process.env.POSITION_MONITOR_FREQ) || 60000; // Default 1 min
    }

    async initialize() {
        this.isRunning = true;
        this.startMonitoring();
        console.log("📈 Position Manager initialized");
    }

    startMonitoring() {
        this.monitoringInterval = setInterval(() => this.checkPositions(), this.checkFrequency);
    }

    async checkPositions() {
        if (!this.isRunning) return;

        try {
            // Get all executed targets with autoSell enabled that haven't been sold yet
            // We'll use a virtual 'sold' status or just check positions in the wallet
            const openPositions = await SnipeTarget.find({
                snipeStatus: 'executed',
                'autoSell.enabled': true,
                isActive: false // It's inactive because it was executed, but autoSell keeps it 'tracked'
            });

            if (openPositions.length === 0) return;

            const tokenAddresses = openPositions.map(p => p.tokenAddress);
            const prices = await this.getJupiterPrices(tokenAddresses);

            for (const position of openPositions) {
                await this.evaluatePosition(position, prices[position.tokenAddress]);
            }
        } catch (error) {
            console.error("❌ Error checking positions:", error);
        }
    }

    async getJupiterPrices(addresses) {
        if (addresses.length === 0) return {};
        try {
            const ids = addresses.join(',');
            // Using DexScreener for reliable public pricing (priceNative = price in SOL)
            const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${ids}`);

            const prices = {};
            if (response.data && response.data.pairs) {
                response.data.pairs.forEach(pair => {
                    // Use the first pair found (usually most liquid) or match the token address
                    if (pair.baseToken && pair.baseToken.address) {
                        // DexScreener returns priceNative which is price in SOL for Solana pairs
                        if (!prices[pair.baseToken.address]) {
                            prices[pair.baseToken.address] = {
                                id: pair.baseToken.address,
                                type: "derivedPrice",
                                price: parseFloat(pair.priceNative)
                            };
                        }
                    }
                });
            }

            // Map back to the structure expected by evaluatePosition (keys are addresses)
            return prices;
        } catch (error) {
            console.error("❌ Error fetching DexScreener prices:", error.message);
            return {};
        }
    }

    async evaluatePosition(position, currentPriceData) {
        if (!currentPriceData || !currentPriceData.price) return;

        const currentPrice = parseFloat(currentPriceData.price);
        const entryPrice = position.executionPrice;

        if (!entryPrice) return;

        const priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;

        const tp = position.autoSell.takeProfitPercent;
        const sl = -Math.abs(position.autoSell.stopLossPercent); // Ensure SL is negative

        console.log(`📊 Position ${position.tokenSymbol}: Entry ${entryPrice}, Current ${currentPrice} (${priceChangePercent.toFixed(2)}%)`);

        if (priceChangePercent >= tp) {
            console.log(`🚀 Take Profit triggered for ${position.tokenSymbol} (+${priceChangePercent.toFixed(2)}%)`);
            await this.executeAutoSell(position, currentPrice, 'Take Profit');
        } else if (priceChangePercent <= sl) {
            console.log(`🚨 Stop Loss triggered for ${position.tokenSymbol} (${priceChangePercent.toFixed(2)}%)`);
            await this.executeAutoSell(position, currentPrice, 'Stop Loss');
        }
    }

    async executeAutoSell(position, price, reason) {
        try {
            const adminId = position.userId;

            // Fetch user's active wallet from database
            // Use the userId from the position record instead of hardcoded adminId
            const userWalletRecord = await UserWallet.findOne({ userId: position.userId, isActive: true });

            let customWallet = null;
            if (userWalletRecord) {
                try {
                    let secretKey;
                    if (userWalletRecord.privateKey.startsWith('[') && userWalletRecord.privateKey.endsWith(']')) {
                        const numbers = JSON.parse(userWalletRecord.privateKey);
                        secretKey = new Uint8Array(numbers);
                    } else {
                        secretKey = bs58.decode(userWalletRecord.privateKey);
                    }
                    customWallet = Keypair.fromSecretKey(secretKey);
                    console.log(`🔑 Using custom wallet for user ${adminId}: ${userWalletRecord.publicKey}`);
                } catch (walletError) {
                    console.error(`❌ Error parsing user wallet key:`, walletError);
                    // Fallback to default wallet if this fails
                }
            } else {
                console.log(`ℹ️ No custom wallet found for user ${adminId}, using default .env wallet`);
            }

            // Fetch token metadata for correct decimals
            let decimals = 9;
            let symbol = position.tokenSymbol || 'TOKEN';
            try {
                const metadata = await getTokenMetadata(position.tokenAddress);
                if (metadata) {
                    decimals = metadata.decimals;
                    symbol = metadata.symbol;
                }
            } catch (metaError) {
                console.warn(`⚠️ Could not fetch metadata for ${position.tokenAddress}, using defaults`);
            }

            await sendMessage(adminId, `🛡️ *Auto-Sell Triggered (${reason})*\n\n` +
                `🪙 **Token:** ${symbol}\n` +
                `📈 **Profit/Loss:** ${(((price - position.executionPrice) / position.executionPrice) * 100).toFixed(2)}%\n` +
                `🔄 **Executing Sell via Jupiter...**`, { parse_mode: 'Markdown' });

            // Build a swap object for executeJupiterSwap
            const sellSwap = {
                sourceWallet: userWalletRecord ? userWalletRecord.publicKey : 'N/A',
                sourceChain: 'solana',
                sourceTxHash: `auto-sell-${Date.now()}`, // Identifier for logs
                tokenIn: {
                    address: position.tokenAddress,
                    symbol: symbol,
                    amount: position.amountReceived.toString(), // Sell everything we received
                    decimals: decimals
                },
                tokenOut: {
                    address: "So11111111111111111111111111111111111111112", // SOL
                    symbol: "SOL",
                    decimals: 9
                }
            };

            const result = await executeJupiterSwap(sellSwap, customWallet);

            if (result.success) {
                position.autoSell.enabled = false; // Disable autoSell after execution
                position.notes += `\n[Auto-Sell] Sold via ${reason} at ${price}. Tx: ${result.txHash}`;
                await position.save();

                await sendMessage(adminId, `✅ *Auto-Sell Successful!*\n\n` +
                    `🪙 **Token:** ${position.tokenSymbol}\n` +
                    `🔗 [View Transaction](https://solscan.io/tx/${result.txHash})`, { parse_mode: 'Markdown' });
            } else {
                console.error(`❌ Auto-Sell failed for ${position.tokenSymbol}:`, result.error);
                await sendMessage(adminId, `❌ *Auto-Sell Failed*\n\n` +
                    `🪙 **Token:** ${position.tokenSymbol}\n` +
                    `🚨 **Error:** ${result.error}`, { parse_mode: 'Markdown' });
            }

        } catch (error) {
            console.error(`❌ Error executing auto-sell for ${position.tokenSymbol}:`, error);
        }
    }

    stop() {
        this.isRunning = false;
        if (this.monitoringInterval) clearInterval(this.monitoringInterval);
    }
}

module.exports = new PositionManager();
