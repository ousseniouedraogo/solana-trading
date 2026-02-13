// src/services/sniping/tokenMonitor.js
const { Connection, PublicKey } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { getSolanaConnection } = require("../wallets/solana");
const SnipeTarget = require("../../db/models/snipeTargets");
const SnipeExecution = require("../../db/models/snipeExecutions");
const UserWallet = require("../../db/models/userWallets");
const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58").default || require("bs58");
const { executeSnipe } = require("./snipeExecutor");
const axios = require("axios");
require("dotenv").config();

class TokenMonitor {
  constructor() {
    this.connection = null;
    this.wsConnection = null;
    this.isRunning = false;
    this.subscriptions = new Map();
    this.processedTransactions = new Set();
    this.raydiumProgramId = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
    this.orcaProgramId = new PublicKey("9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP");

    // Keep track of processed transactions to avoid duplicates
    this.processedTxCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  async initialize() {
    try {
      console.log("🔍 Initializing Token Monitor...");

      this.connection = getSolanaConnection();

      // Test connection
      const version = await this.connection.getVersion();
      console.log(`✅ Connected to Solana RPC: ${version['solana-core']}`);

      // WebSocket will be handled by the main connection if SOLANA_WSS_URL is set in wallets/solana.js
      if (process.env.SOLANA_WSS_URL) {
        console.log("📡 WebSocket monitoring will be used via main connection");
        this.wsConnection = this.connection; // Map it for existing logic
      }

      // Start monitoring
      this.isRunning = true;
      this.startMonitoring();

      console.log("🚀 Token Monitor initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize Token Monitor:", error);
      throw error;
    }
  }

  async startMonitoring() {
    if (!this.isRunning) return;

    console.log("🔄 Starting token monitoring...");

    // Only monitor Raydium/Orca if ProScanner is NOT enabled to avoid redundancy
    if (process.env.USE_PRO_SCANNER !== 'true') {
      // Monitor Raydium pool creation
      this.monitorRaydiumPools();

      // Monitor Orca pool creation  
      this.monitorOrcaPools();
    } else {
      console.log("ℹ️ ProScanner is enabled. Global Raydium/Orca monitoring in TokenMonitor disabled.");
    }

    // Start processing active snipe targets
    this.processSnipeTargets();

    // Clean up old processed transactions periodically
    setInterval(() => this.cleanupProcessedTxCache(), 60000); // Every minute
  }

  async monitorRaydiumPools() {
    try {
      if (this.wsConnection) {
        // WebSocket monitoring for real-time updates
        console.log("📡 Setting up WebSocket monitoring for Raydium pools...");

        const subscriptionId = this.wsConnection.onLogs(
          this.raydiumProgramId,
          (logs, context) => {
            this.handleRaydiumLogs(logs, context);
          },
          'confirmed'
        );

        this.subscriptions.set('raydium', subscriptionId);
      } else {
        // Fallback to polling mode
        console.log("🔄 Using polling mode for Raydium pool monitoring...");
        this.pollRaydiumPools();
      }
    } catch (error) {
      console.error("❌ Error setting up Raydium monitoring:", error);
      // Fallback to polling
      this.pollRaydiumPools();
    }
  }

  async monitorOrcaPools() {
    try {
      if (this.wsConnection) {
        console.log("📡 Setting up WebSocket monitoring for Orca pools...");

        const subscriptionId = this.wsConnection.onLogs(
          this.orcaProgramId,
          (logs, context) => {
            this.handleOrcaLogs(logs, context);
          },
          'confirmed'
        );

        this.subscriptions.set('orca', subscriptionId);
      } else {
        console.log("🔄 Using polling mode for Orca pool monitoring...");
        this.pollOrcaPools();
      }
    } catch (error) {
      console.error("❌ Error setting up Orca monitoring:", error);
      this.pollOrcaPools();
    }
  }

  async handleRaydiumLogs(logs, context) {
    try {
      const signature = logs.signature;

      // Check if already processed
      if (this.isTransactionProcessed(signature)) {
        return;
      }

      // Mark as processed
      this.markTransactionProcessed(signature);

      // Look for pool creation events
      const poolCreationLogs = logs.logs.filter(log =>
        log.includes("initialize") || log.includes("InitializeInstruction")
      );

      if (poolCreationLogs.length > 0) {
        console.log(`🆕 Potential Raydium pool creation detected: ${signature}`);
        await this.processNewPool(signature, 'raydium', context);
      }
    } catch (error) {
      console.error("❌ Error handling Raydium logs:", error);
    }
  }

  async handleOrcaLogs(logs, context) {
    try {
      const signature = logs.signature;

      if (this.isTransactionProcessed(signature)) {
        return;
      }

      this.markTransactionProcessed(signature);

      const poolCreationLogs = logs.logs.filter(log =>
        log.includes("initialize") || log.includes("InitializePool")
      );

      if (poolCreationLogs.length > 0) {
        console.log(`🆕 Potential Orca pool creation detected: ${signature}`);
        await this.processNewPool(signature, 'orca', context);
      }
    } catch (error) {
      console.error("❌ Error handling Orca logs:", error);
    }
  }

  async processNewPool(signature, dexType, context) {
    try {
      console.log(`🔍 Processing new ${dexType} pool: ${signature}`);

      // Get transaction details
      const transaction = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!transaction) {
        console.log(`⚠️  Transaction not found: ${signature}`);
        return;
      }

      // Parse transaction to extract token information
      const tokenInfo = await this.parsePoolTransaction(transaction, dexType);

      if (!tokenInfo) {
        console.log(`⚠️  Could not parse token info from transaction: ${signature}`);
        return;
      }

      console.log(`🎯 New token detected: ${tokenInfo.symbol} (${tokenInfo.address})`);

      // Check if any active snipe targets match this token
      await this.checkSnipeTargets(tokenInfo, signature);

    } catch (error) {
      console.error(`❌ Error processing new pool ${signature}:`, error);
    }
  }

  async parsePoolTransaction(transaction, dexType) {
    try {
      // Extract token mints from postTokenBalances (more reliable for pool creation)
      const postTokenBalances = transaction.meta?.postTokenBalances || [];
      const preTokenBalances = transaction.meta?.preTokenBalances || [];

      if (postTokenBalances.length === 0) {
        console.log("⚠️  No token balances found in transaction");
        return null;
      }

      // Find new token mints (present in post but not in pre)
      const preMints = new Set(preTokenBalances.map(b => b.mint));
      const newMints = postTokenBalances
        .filter(b => !preMints.has(b.mint))
        .map(b => b.mint)
        .filter(mint => {
          // Exclude SOL and common stablecoins
          return mint !== "So11111111111111111111111111111111111111112" &&
            mint !== "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" &&
            mint !== "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
        });

      // 2. Fallback: Find any valid token mint that is not SOL or a common stablecoin
      const allMints = postTokenBalances.map(b => b.mint);
      const candidates = allMints.filter(mint => {
        return mint !== "So11111111111111111111111111111111111111112" &&
          mint !== "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" &&
          mint !== "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
      });

      if (candidates.length === 0) {
        console.log("⚠️  No valid token mints found in pool transaction");
        return null;
      }

      const tokenAddress = candidates[0];
      console.log(`📍 Found token mint: ${tokenAddress}`);

      // Try to get metadata with a slight delay if it's very new (to allow Moralis/DexScreener to catch up)
      let metadata = await this.getTokenMetadata(tokenAddress);

      return {
        address: tokenAddress,
        symbol: metadata?.symbol || 'UNKNOWN',
        name: metadata?.name || '',
        decimals: metadata?.decimals || 9,
        dexType: dexType,
        poolAddress: tokenAddress
      };

    } catch (error) {
      console.error("❌ Error parsing pool transaction:", error);
      return null;
    }
  }

  async getTokenMetadata(mintAddress) {
    try {
      // Try to get token metadata from DexScreener API (Free & No Key required)
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`, {
        timeout: 5000
      });

      if (response.data && response.data.pairs && response.data.pairs.length > 0) {
        const pair = response.data.pairs[0];
        return {
          symbol: pair.baseToken.symbol || 'UNKNOWN',
          name: pair.baseToken.name || '',
          decimals: 9 // DexScreener doesn't always provide decimals clearly, but 9 is standard for Solana
        };
      }

      // Fallback: Try Jupiter v3 (requires key, but may work if they have one set in headers later)
      // For now, let's use on-chain fallback if DexScreener fails

      const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(mintAddress));
      if (mintInfo.value && mintInfo.value.data.parsed) {
        return {
          symbol: 'UNKNOWN',
          name: '',
          decimals: mintInfo.value.data.parsed.info.decimals || 9
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ Error getting token metadata for ${mintAddress}:`, error.message);

      // Attempt on-chain parsing even on error
      try {
        const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(mintAddress));
        if (mintInfo.value && mintInfo.value.data.parsed) {
          return {
            symbol: 'UNKNOWN',
            name: '',
            decimals: mintInfo.value.data.parsed.info.decimals || 9
          };
        }
      } catch (e) { }

      return null;
    }
  }

  extractPoolAddress(transaction, dexType) {
    // Simplified pool address extraction
    // In production, you'd implement proper instruction parsing
    const accountKeys = transaction.transaction.message.accountKeys;
    return accountKeys[0]; // Placeholder
  }

  async checkSnipeTargets(tokenInfo, signature) {
    try {
      // Get all active snipe targets for this token
      const targets = await SnipeTarget.find({
        tokenAddress: tokenInfo.address,
        isActive: true,
        snipeStatus: 'pending'
      });

      if (targets.length === 0) {
        console.log(`📋 No active snipe targets for ${tokenInfo.symbol}`);
        return;
      }

      console.log(`🎯 Found ${targets.length} snipe target(s) for ${tokenInfo.symbol}`);

      // Process each target
      for (const target of targets) {
        try {
          await this.processSnipeTarget(target, tokenInfo, signature);
        } catch (error) {
          console.error(`❌ Error processing snipe target ${target._id}:`, error);
        }
      }
    } catch (error) {
      console.error("❌ Error checking snipe targets:", error);
    }
  }

  async processSnipeTarget(target, tokenInfo, triggerSignature) {
    try {
      console.log(`🚀 Processing snipe target: ${target.tokenSymbol} for user ${target.userId}`);

      // ✅ DUPLICATE PURCHASE PREVENTION
      // Check if user already has an executed, closed, or IN-PROGRESS position for this token
      const existingPosition = await SnipeTarget.findOne({
        userId: target.userId,
        tokenAddress: target.tokenAddress,
        snipeStatus: { $in: ['executing', 'executed', 'closed'] },
        _id: { $ne: target._id } // Don't match ourselves
      });

      if (existingPosition) {
        console.log(`⚠️ User ${target.userId} already has a ${existingPosition.snipeStatus} position for ${tokenInfo.symbol}. Skipping duplicate purchase.`);

        // Mark this target as cancelled
        target.snipeStatus = 'cancelled';
        target.isActive = false;
        target.notes = `Cancelled: Found another target for this token with status ${existingPosition.snipeStatus}`;
        await target.save();

        return;
      }

      // 🔒 LOCKING THE TARGET
      // Set status to 'executing' immediately to prevent other concurrent threads from trying
      target.snipeStatus = 'executing';
      await target.save();

      // Create snipe execution record
      const execution = new SnipeExecution({
        userId: target.userId,
        targetId: target._id,
        tokenAddress: target.tokenAddress,
        tokenSymbol: tokenInfo.symbol,
        status: 'pending',
        amountIn: target.targetAmount,
        slippageTarget: target.maxSlippage,
        priorityFee: target.priorityFee,
        detectionTime: new Date(),
        executionStartTime: new Date(),
        marketData: {
          poolAddress: tokenInfo.poolAddress
        }
      });

      await execution.save();

      // Fetch user's active wallet from database
      const userWalletRecord = await UserWallet.findOne({ userId: target.userId, isActive: true });

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
          console.log(`🔑 Using custom wallet for snipe (user ${target.userId}): ${userWalletRecord.publicKey}`);
        } catch (walletError) {
          console.error(`❌ Error parsing user wallet key for snipe:`, walletError);
        }
      } else {
        console.log(`ℹ️ No custom wallet found for user ${target.userId}, using default .env wallet`);
      }

      // Execute the snipe
      const result = await executeSnipe(target, execution, tokenInfo, customWallet);

      if (result.success) {
        console.log(`✅ Snipe executed successfully for ${tokenInfo.symbol}`);

        // Update target as executed
        await target.markAsExecuted({
          price: result.executionPrice,
          amountReceived: result.amountOut,
          transactionHash: result.txHash
        });

        // Update execution record
        await execution.markAsSuccess({
          amountOut: result.amountOut,
          executionPrice: result.executionPrice,
          slippageActual: result.slippageActual,
          transactionHash: result.txHash,
          blockNumber: result.blockNumber,
          marketData: result.marketData
        });

      } else {
        console.log(`❌ Snipe failed for ${tokenInfo.symbol}: ${result.error}`);

        // Update target as failed
        await target.markAsFailed(result.error);

        // Update execution record
        await execution.markAsFailed({
          code: result.errorCategory,
          message: result.error
        });
      }

    } catch (error) {
      console.error(`❌ Error processing snipe target:`, error);
    }
  }

  async processSnipeTargets() {
    // Process existing snipe targets that might have been triggered
    setInterval(async () => {
      try {
        const activeTargets = await SnipeTarget.getActiveTargets();
        const maxPendingMinutes = parseInt(process.env.MAX_SNIPE_PENDING_MINUTES) || 15;

        for (const target of activeTargets) {
          // 1. Expiry Check: If target is too old and still pending, cancel it
          const ageMs = Date.now() - new Date(target.createdAt).getTime();
          if (ageMs > maxPendingMinutes * 60 * 1000) {
            console.log(`⏰ Snipe target expired for ${target.tokenSymbol} (${target.tokenAddress})`);
            target.snipeStatus = 'cancelled';
            target.isActive = false;
            target.notes = `Expired: No liquidity detected within ${maxPendingMinutes} minutes.`;
            await target.save();
            continue;
          }

          // 2. Check if target conditions (liquidity) are met
          await this.checkTargetConditions(target);
        }
      } catch (error) {
        console.error("❌ Error processing snipe targets:", error);
      }
    }, 2000); // Reduced to 2 seconds for faster sniping
  }

  async checkTargetConditions(target) {
    try {
      // Check if liquidity threshold is met
      if (target.triggerCondition === 'liquidity_added') {
        const liquidityInfo = await this.getTokenLiquidity(target.tokenAddress);

        if (!liquidityInfo) {
          // No liquidity found yet, stay pending
          return;
        }

        // Logic normalizing liquidity check:
        // target.minLiquidity is SOL (default 0). DexScreener returns USD.
        // If minLiquidity is 0, we proceed as soon as ANY liquidity is found (Jupiter or Dex).
        const isLiquidEnough = liquidityInfo.isJupiterReady ||
          (target.minLiquidity === 0 && (liquidityInfo.totalLiquidity > 0)) ||
          (liquidityInfo.totalLiquidity >= target.minLiquidity);

        if (isLiquidEnough) {
          const sourceInfo = liquidityInfo.isJupiterReady ? '(Jupiter Ready)' : `(${liquidityInfo.totalLiquidity} USD via Dex)`;
          console.log(`💰 Liquidity detected for ${target.tokenSymbol} ${sourceInfo}`);

          // Market cap filter disabled — snipe immediately when liquidity is found
          console.log(`ℹ️ Liquidity found for ${target.tokenSymbol} — proceeding to snipe.`);

          const tokenInfo = {
            address: target.tokenAddress,
            symbol: target.tokenSymbol,
            name: target.tokenName,
            decimals: 9, // Default for most tokens
            poolAddress: liquidityInfo.poolAddress || target.tokenAddress
          };

          await this.processSnipeTarget(target, tokenInfo, 'liquidity_check');
        }
      }
    } catch (error) {
      console.error(`❌ Error checking target conditions:`, error);
    }
  }

  async getTokenLiquidity(tokenAddress) {
    const isPumpToken = tokenAddress.toLowerCase().endsWith('pump');

    try {
      // 1. If it's a Pump.fun token, TRY JUPITER FIRST (Highest speed)
      if (isPumpToken) {
        try {
          const jupResult = await this.checkJupiterLiquidity(tokenAddress);
          if (jupResult) return jupResult;
        } catch (e) { /* ignore and try next */ }
      }

      // 2. Try DexScreener API (Standard approach)
      try {
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
          timeout: 2000 // Reduced timeout
        });

        if (response.data && response.data.pairs && response.data.pairs.length > 0) {
          const pair = response.data.pairs[0];
          return {
            totalLiquidity: pair.liquidity?.usd || 0,
            poolAddress: pair.pairAddress,
            source: 'dexscreener'
          };
        }
      } catch (e) {
        // Soft fail
      }

      // 3. Fallback/Standard Jupiter check for non-pump tokens
      if (!isPumpToken) {
        return await this.checkJupiterLiquidity(tokenAddress);
      }

      return null;
    } catch (error) {
      console.error(`❌ Error getting token liquidity:`, error.message);
      return null;
    }
  }

  async checkJupiterLiquidity(tokenAddress) {
    try {
      const { getSolanaWallet } = require("../wallets/solana");
      const wallet = getSolanaWallet();

      // Small amount quote check (0.1 SOL) - verify if route exists
      const amount = 100000000;
      const quoteUrl = `https://lite-api.jup.ag/ultra/v1/order?inputMint=So11111111111111111111111111111111111111112&outputMint=${tokenAddress}&amount=${amount}&taker=${wallet.publicKey.toString()}&slippageBps=1000`;

      const jupResponse = await axios.get(quoteUrl, {
        timeout: 2000, // Reduced timeout
        headers: { 'User-Agent': 'SolanaSnipeBot/1.0' }
      });

      if (jupResponse.data && jupResponse.data.transaction) {
        console.log(`📡 Jupiter confirms route available for ${tokenAddress.substring(0, 8)}...`);
        return {
          totalLiquidity: 1000, // Synthetic liquidity value to pass threshold
          poolAddress: tokenAddress,
          source: 'jupiter',
          isJupiterReady: true
        };
      }
    } catch (e) {
      // No Jupiter route yet
    }
    return null;
  }

  // Polling fallback methods
  async pollRaydiumPools() {
    setInterval(async () => {
      try {
        // Get recent transactions for Raydium program
        const signatures = await this.connection.getSignaturesForAddress(
          this.raydiumProgramId,
          { limit: 10 }
        );

        for (const sig of signatures) {
          if (!this.isTransactionProcessed(sig.signature)) {
            await this.processNewPool(sig.signature, 'raydium', null);
          }
        }
      } catch (error) {
        console.error("❌ Error polling Raydium pools:", error);
      }
    }, 30000); // Poll every 30 seconds
  }

  async pollOrcaPools() {
    setInterval(async () => {
      try {
        const signatures = await this.connection.getSignaturesForAddress(
          this.orcaProgramId,
          { limit: 10 }
        );

        for (const sig of signatures) {
          if (!this.isTransactionProcessed(sig.signature)) {
            await this.processNewPool(sig.signature, 'orca', null);
          }
        }
      } catch (error) {
        console.error("❌ Error polling Orca pools:", error);
      }
    }, 30000);
  }

  // Utility methods
  isTransactionProcessed(signature) {
    return this.processedTxCache.has(signature);
  }

  markTransactionProcessed(signature) {
    this.processedTxCache.set(signature, Date.now());
  }

  cleanupProcessedTxCache() {
    const now = Date.now();
    for (const [signature, timestamp] of this.processedTxCache) {
      if (now - timestamp > this.cacheExpiry) {
        this.processedTxCache.delete(signature);
      }
    }
  }

  async stop() {
    console.log("🛑 Stopping Token Monitor...");
    this.isRunning = false;

    // Close WebSocket subscriptions
    if (this.wsConnection) {
      for (const [name, subscriptionId] of this.subscriptions) {
        try {
          await this.wsConnection.removeOnLogsListener(subscriptionId);
          console.log(`✅ Closed ${name} subscription`);
        } catch (error) {
          console.error(`❌ Error closing ${name} subscription:`, error);
        }
      }
    }

    this.subscriptions.clear();
    console.log("✅ Token Monitor stopped");
  }
}

module.exports = TokenMonitor;