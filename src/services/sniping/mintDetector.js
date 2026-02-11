// src/services/sniping/mintDetector.js
const { Connection, PublicKey } = require("@solana/web3.js");
const { getSolanaConnection } = require("../wallets/solana");
const TrackedWallet = require("../../db/models/trackedWallets");
const SnipeTarget = require("../../db/models/snipeTargets");
const { executeSnipe } = require("./snipeExecutor");
const { getTokenMetadata } = require("../moralis/tokenMetadata");
const { sendMessage } = require("../../utils/notifier");
const AlertHistory = require("../../db/models/alertHistory");
const UserWallet = require("../../db/models/userWallets");
const SnipeExecution = require("../../db/models/snipeExecutions");
const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58").default || require("bs58");

class MintDetector {
    constructor() {
        this.connection = null;
        this.isRunning = false;
        this.pollingInterval = null;
        this.processedTransactions = new Set();
        this.lastProcessedSignatures = new Map(); // wallet -> last signature
        this.subscriptions = new Map(); // wallet -> subId
    }

    async initialize() {
        try {
            this.connection = getSolanaConnection();
            this.isRunning = true;
            this.startPolling();
            await this.startRealTimeMonitoring();
            console.log("🚀 Mint Detector initialized with Real-Time tracking");
        } catch (error) {
            console.error("❌ Failed to initialize Mint Detector:", error);
        }
    }

    startPolling() {
        const freq = parseInt(process.env.MINT_DETECTION_FREQ) || 15000; // Faster default: 15s
        this.pollingInterval = setInterval(() => this.pollTrackedWallets(), freq);
    }

    async startRealTimeMonitoring() {
        try {
            const wallets = await TrackedWallet.find({ isActive: true, role: 'dev_sniper' });
            for (const wallet of wallets) {
                this.subscribeToWallet(wallet.address);
            }
        } catch (error) {
            console.error("❌ Error starting Real-Time monitoring:", error);
        }
    }

    subscribeToWallet(address) {
        if (this.subscriptions.has(address)) return;
        try {
            const publicKey = new PublicKey(address);
            const subId = this.connection.onLogs(publicKey, (logs) => {
                if (this.processedTransactions.has(logs.signature)) return;
                this.processedTransactions.add(logs.signature);
                this.processTransaction(logs.signature, { address });
            }, 'confirmed');
            this.subscriptions.set(address, subId);
            console.log(`📡 Real-time tracking started for: ${address}`);
        } catch (e) {
            console.error(`❌ Failed to subscribe to wallet ${address}:`, e.message);
        }
    }

    unsubscribeFromWallet(address) {
        const subId = this.subscriptions.get(address);
        if (subId !== undefined) {
            try {
                this.connection.removeOnLogsListener(subId);
                this.subscriptions.delete(address);
                console.log(`📴 Real-time tracking stopped for: ${address}`);
            } catch (e) {
                console.error(`❌ Failed to unsubscribe from wallet ${address}:`, e.message);
            }
        }
    }

    async pollTrackedWallets() {
        try {
            const wallets = await TrackedWallet.find({ isActive: true, role: 'dev_sniper' });

            // --- Synchronization Logic ---
            const activeAddresses = new Set(wallets.map(w => w.address));

            // 1. Unsubscribe from wallets that were removed from DB
            for (const address of this.subscriptions.keys()) {
                if (!activeAddresses.has(address)) {
                    console.log(`🗑️ Wallet removed from DB, unsubscribing: ${address}`);
                    this.unsubscribeFromWallet(address);
                }
            }

            // 2. Process active wallets
            for (const wallet of wallets) {
                // Subscribe if not already subscribed (e.g. newly added)
                if (!this.subscriptions.has(wallet.address)) {
                    this.subscribeToWallet(wallet.address);
                }

                // Standard polling check
                await this.checkWalletTransactions(wallet);
            }
        } catch (error) {
            console.error("❌ Error polling wallets for mints:", error);
        }
    }

    async checkWalletTransactions(wallet) {
        try {
            const publicKey = new PublicKey(wallet.address);
            const options = { limit: 10 };

            const lastSignature = this.lastProcessedSignatures.get(wallet.address);
            if (lastSignature) {
                options.until = lastSignature;
            }

            const signatures = await this.connection.getSignaturesForAddress(publicKey, options);

            if (signatures.length === 0) return;

            // Update last signature
            this.lastProcessedSignatures.set(wallet.address, signatures[0].signature);

            for (const sigInfo of signatures) {
                if (this.processedTransactions.has(sigInfo.signature)) continue;
                this.processedTransactions.add(sigInfo.signature);

                await this.processTransaction(sigInfo.signature, wallet);
            }

            // Cleanup processedTransactions set periodically (keep last 1000)
            if (this.processedTransactions.size > 1000) {
                const arr = Array.from(this.processedTransactions);
                this.processedTransactions = new Set(arr.slice(-500));
            }

        } catch (error) {
            console.error(`❌ Error checking transactions for ${wallet.address}:`, error.message);
        }
    }

    async processTransaction(signature, wallet) {
        try {
            const tx = await this.connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });

            if (!tx) return;

            // Freshness Check: Skip if transaction is too old
            const blockTime = tx.blockTime; // Unix timestamp in seconds
            const nowSeconds = Math.floor(Date.now() / 1000);
            const maxAge = parseInt(process.env.MAX_SNIPE_AGE_SECONDS) || 60;

            if (blockTime && (nowSeconds - blockTime) > maxAge) {
                console.log(`⏳ Skipping old transaction (${nowSeconds - blockTime}s old): ${signature}`);
                return;
            }

            // Check for CreateMint instructions (Token Program or Token2022)
            const logs = tx.meta?.logMessages || [];
            const hasInitializeMint = logs.some(log => log.includes("InitializeMint") || log.includes("InitializeMint2"));
            const hasRaydiumInit = logs.some(log => log.includes("initialize2") || log.includes("InitializeInstruction2"));

            if (hasInitializeMint || hasRaydiumInit) {
                console.log(`🎯 Detected potential token creation or pool init by tracked wallet ${wallet.address}: ${signature}`);

                // Extract token address
                const tokenAddress = this.extractTokenAddress(tx);
                if (tokenAddress) {
                    await this.handleDetectedToken(tokenAddress, wallet, signature, hasRaydiumInit ? 'liquidity_init' : 'mint');
                }
            }
        } catch (error) {
            console.error(`❌ Error processing transaction ${signature}:`, error.message);
        }
    }

    extractTokenAddress(tx) {
        const postTokenBalances = tx.meta?.postTokenBalances || [];
        const preTokenBalances = tx.meta?.preTokenBalances || [];

        // 1. Try to find a new mint (classic token creation)
        const preMints = new Set(preTokenBalances.map(b => b.mint));
        for (const balance of postTokenBalances) {
            if (!preMints.has(balance.mint)) {
                if (["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"].includes(balance.mint)) continue;
                return balance.mint;
            }
        }

        // 2. Fallback for Raydium/Orca pools: find any non-SOL/stable token
        const candidates = postTokenBalances
            .map(b => b.mint)
            .filter(mint => !["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"].includes(mint));

        if (candidates.length > 0) return candidates[0];

        return null;
    }

    async handleDetectedToken(tokenAddress, wallet, signature, type) {
        try {
            const adminId = process.env.TELEGRAM_ADMIN_ID || process.env.ADMIN_CHAT_ID;
            if (!adminId) return;

            // Check if we already alerted this token/type to this admin
            const existingAlert = await AlertHistory.findOne({
                tokenAddress,
                alertType: type,
                chatId: adminId
            });

            if (existingAlert) {
                console.log(`ℹ️ Skipping duplicate alert for ${tokenAddress} (${type})`);
                return;
            }

            const metadata = await getTokenMetadata(tokenAddress);

            const message = `🚨 *NEW TOKEN DETECTED from Tracked Wallet!*\n\n` +
                `👤 **By:** ${wallet.name || wallet.address.substring(0, 8) + '...'}\n` +
                `🪙 **Token:** ${metadata.symbol} (${metadata.name})\n` +
                `📋 **Address:** \`${tokenAddress}\`\n` +
                `🔔 **Type:** ${type === 'mint' ? 'Token Creation' : 'Pool Initialization'}\n` +
                `🔗 [View on Solscan](https://solscan.io/tx/${signature})`;

            // Notify admin
            await sendMessage(adminId, message, { parse_mode: 'Markdown' });

            // Save to history to prevent duplicates
            await AlertHistory.create({
                tokenAddress,
                alertType: type,
                chatId: adminId
            });

            // Check if we should auto-snipe
            const autoSnipeEnabled = process.env.AUTO_SNIPE_TRACKED === 'true';
            if (autoSnipeEnabled) {
                console.log(`🚀 Automated Snipe Triggered for ${tokenAddress}`);
                await this.executeAutoSnipe(tokenAddress, metadata, wallet, signature, type);
            } else {
                console.log(`🔍 Token ${tokenAddress} detected, auto-snipe disabled.`);
            }

        } catch (error) {
            console.error("❌ Error handling detected token:", error);
        }
    }

    async executeAutoSnipe(tokenAddress, metadata, wallet, signature, type) {
        try {
            const userId = wallet.addedBy || process.env.TELEGRAM_ADMIN_ID || process.env.ADMIN_CHAT_ID;

            // 0. Check if a target already exists for this token and user
            const existingTarget = await SnipeTarget.findOne({ userId, tokenAddress, isActive: true });
            if (existingTarget && type !== 'liquidity_init') {
                console.log(`ℹ️ Snipe target already exists for ${tokenAddress}, skipping duplicate creation.`);
                return;
            }

            // 1. Create or Update Snipe Target
            const targetAmount = parseFloat(process.env.AUTO_SNIPE_AMOUNT) || 0.1;
            const tp = parseFloat(process.env.AUTO_SNIPE_TP) || 100;
            const sl = parseFloat(process.env.AUTO_SNIPE_SL) || 50;

            const target = existingTarget || new SnipeTarget({
                userId: userId,
                tokenAddress: tokenAddress,
                tokenSymbol: metadata.symbol || "UNKNOWN",
                tokenName: metadata.name || "Auto-Sniped",
                targetAmount: targetAmount,
                maxSlippage: 15.0,
                priorityFee: 0.005,
                isActive: true,
                snipeStatus: 'pending',
                triggerCondition: 'manual',
                autoSell: {
                    enabled: true,
                    takeProfitPercent: tp,
                    stopLossPercent: sl
                }
            });

            target.notes = `[Auto-Snipe] Last activity by ${wallet.address} via ${type}`;

            // If it's a new mint (no pool yet), we MUST wait for liquidity
            if (type !== 'liquidity_init') {
                target.triggerCondition = 'liquidity_added';
                console.log(`⏳ New mint detected. Setting trigger to 'liquidity_added'.`);
            }

            await target.save();
            console.log(`✅ Snipe Target created for ${metadata.symbol}`);

            // Market cap filter disabled — buy as soon as liquidity is available
            console.log(`ℹ️ No market cap filter — proceeding to snipe immediately.`);


            // 2. Fetch User Wallet
            const userWalletRecord = await UserWallet.findOne({ userId, isActive: true });
            let customWallet = null;
            if (userWalletRecord) {
                try {
                    let secretKey;
                    if (userWalletRecord.privateKey.startsWith('[') && userWalletRecord.privateKey.endsWith(']')) {
                        secretKey = new Uint8Array(JSON.parse(userWalletRecord.privateKey));
                    } else {
                        secretKey = bs58.decode(userWalletRecord.privateKey);
                    }
                    customWallet = Keypair.fromSecretKey(secretKey);
                } catch (e) {
                    console.error("❌ Failed to reconstruct wallet for auto-snipe:", e.message);
                }
            }

            // 3. Create Execution Record
            const execution = new SnipeExecution({
                userId: userId,
                targetId: target._id,
                tokenAddress: tokenAddress,
                tokenSymbol: metadata.symbol,
                status: 'pending',
                amountIn: targetAmount,
                slippageTarget: 15.0,
                priorityFee: 0.005,
                detectionTime: new Date(),
                executionStartTime: new Date(),
                marketData: {
                    poolAddress: tokenAddress // Using token address as fallback pool address
                }
            });
            await execution.save();

            // 4. Trigger Execution immediately if it's a pool init
            if (type === 'liquidity_init') {
                console.log(`⚡ Immediate execution for liquidity pool init...`);
                const result = await executeSnipe(target, execution, {
                    address: tokenAddress,
                    symbol: metadata.symbol,
                    decimals: metadata.decimals || 9,
                    poolAddress: tokenAddress
                }, customWallet);

                if (result.success) {
                    await target.markAsExecuted({
                        price: result.executionPrice,
                        amountReceived: result.amountOut,
                        transactionHash: result.txHash
                    });
                    await sendMessage(userId, `✅ *AUTO-SNIPE SUCCESSFUL*\n\nToken: ${metadata.symbol}\nAmount: ${targetAmount} SOL\nPurchased: ${result.amountOut} tokens\n🔗 [View](https://solscan.io/tx/${result.txHash})`);
                } else {
                    await target.markAsFailed(result.error);
                }
            } else {
                console.log(`⏳ Token detected but no pool yet. Snipe target remains pending.`);
            }

        } catch (error) {
            console.error("❌ Error in executeAutoSnipe:", error);
        }
    }

    stop() {
        this.isRunning = false;
        if (this.pollingInterval) clearInterval(this.pollingInterval);
    }
}

module.exports = new MintDetector();
