// src/services/polling/swapProcessor.js
const Swap = require("../../db/models/swaps");
const Chain = require("../../db/models/chains");
const BotConfig = require("../../db/models/botConfig");
const TrackedWallet = require("../../db/models/trackedWallets");
const SnipeTarget = require("../../db/models/snipeTargets");
const { executeInchSwap } = require("../execution/inchSwap");
const { executeJupiterSwap } = require("../execution/jupiterSwap");
const { sendMessage } = require("../../utils/notifier");
const {
  formatSwapNotification,
  formatErrorNotification,
} = require("../../telegram/messages");
const UserWallet = require("../../db/models/userWallets");
const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58").default || require("bs58");
require("dotenv").config();

let isRunning = false;
let pollingInterval;

/**
 * Sends a notification to the stored chat ID
 * @param {string} message - The message to send
 * @param {object} options - Options for the message (like parse_mode)
 */
const sendNotification = async (
  message,
  options = { parse_mode: "Markdown" }
) => {
  try {
    const adminId = process.env.TELEGRAM_ADMIN_ID || process.env.ADMIN_CHAT_ID;

    // First, try to get chat ID from database
    const chatIdConfig = await BotConfig.findOne({ setting: "chatId" });
    const targetChatId = (chatIdConfig && chatIdConfig.value) || adminId;

    if (!targetChatId) {
      console.error("❌ NOTIFICATION DELIVERY FAILED: No chat ID found in DB or .env");
      return false;
    }

    const result = await sendMessage(targetChatId, message, options);

    // If it failed and target was DB, try admin as fallback
    if (!result && chatIdConfig && chatIdConfig.value !== adminId && adminId) {
      console.log("⚠️ DB Notification failed, trying fallback to ADMIN_CHAT_ID");
      return await sendMessage(adminId, message, options);
    }

    return !!result;
  } catch (err) {
    console.error("Error sending notification:", err.message);
    return false;
  }
};

/**
 * Process pending swaps in the queue
 */
const processSwaps = async () => {
  // Skip if already running to prevent overlap
  if (isRunning) return;
  isRunning = true;

  try {
    // Check if bot is running
    const botConfig = await BotConfig.findOne({ setting: "botStatus" });
    if (botConfig && botConfig.value !== "running") {
      console.log("Bot is not running. Skipping swap processing.");
      isRunning = false;
      return;
    }

    console.log("Processing pending swaps...");

    // Get pending swaps ordered by timestamp (oldest first)
    const pendingSwaps = await Swap.find({
      processed: false,
      "status.code": "pending",
    })
      .sort({ sourceTimestamp: 1 })
      .limit(10); // Process in batches of 10

    if (pendingSwaps.length === 0) {
      console.log("No pending swaps to process.");
      isRunning = false;
      return;
    }

    console.log(`Found ${pendingSwaps.length} unprocessed swaps to process.`);

    // Track results for summary
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // Process each swap in sequence to maintain order
    for (const swap of pendingSwaps) {
      try {
        // Skip swaps that occurred before the wallet was tracked
        const wallet = await TrackedWallet.findOne({
          address: swap.sourceWallet,
          chain: swap.sourceChain,
        });

        if (wallet && new Date(swap.sourceTimestamp) < wallet.createdAt) {
          console.log(
            `Skipping swap ${swap.sourceTxHash} - occurred before tracking started`
          );

          // Mark as processed but skipped
          swap.processed = true;
          swap.processingTimestamp = new Date();
          swap.status = {
            code: "skipped",
            message: "Swap occurred before wallet tracking was started",
          };
          await swap.save();

          skippedCount++;
          continue;
        }

        console.log(`Processing swap: ${swap.sourceTxHash}`);

        // Get chain information
        const chain = await Chain.findOne({ chainId: swap.sourceChain });

        if (!chain) {
          throw new Error(`Chain ${swap.sourceChain} not found`);
        }

        // Apply global investment override (using AUTO_SNIPE_AMOUNT from .env if available)
        const globalAmount = process.env.AUTO_SNIPE_AMOUNT || "0.011";
        if (swap.sourceChain === "solana" && swap.tokenIn && swap.tokenIn.address === "So11111111111111111111111111111111111111112") {
          console.log(`⚠️ Overriding copy amount from ${swap.tokenIn.amount} to ${globalAmount} SOL`);
          swap.tokenIn.amount = globalAmount;
        }

        // ✅ DUPLICATE PURCHASE PREVENTION FOR COPY TRADING
        // Check if user already owns this token (for Solana swaps buying tokens)
        if (swap.sourceChain === "solana" && swap.tokenIn && swap.tokenIn.address === "So11111111111111111111111111111111111111112") {
          const SnipeTarget = require("../../db/models/snipeTargets");
          const existingPosition = await SnipeTarget.findOne({
            userId: process.env.TELEGRAM_ADMIN_ID || process.env.ADMIN_CHAT_ID,
            tokenAddress: swap.tokenOut.address,
            snipeStatus: 'executed'
          });

          if (existingPosition) {
            console.log(`⚠️  User already owns ${swap.tokenOut.symbol}. Skipping duplicate copy trade purchase.`);
            swap.processed = true;
            swap.status = {
              code: "skipped",
              message: "Duplicate purchase prevented - user already owns this token"
            };
            await swap.save();
            skippedCount++;
            continue;
          }
        }

        // Execute the swap based on chain type
        let result;
        if (chain.type === "evm") {
          result = await executeInchSwap(swap, chain);
        } else if (chain.type === "solana") {
          // Fetch user's active wallet for Solana swaps
          const userId = (wallet && wallet.addedBy) || process.env.TELEGRAM_ADMIN_ID || process.env.ADMIN_CHAT_ID;
          const userWalletRecord = await UserWallet.findOne({ userId, isActive: true });

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
              console.log(`🔑 Using custom wallet for copy trade (user ${userId}): ${userWalletRecord.publicKey}`);
            } catch (walletError) {
              console.error(`❌ Error parsing user wallet key for copy trade:`, walletError);
            }
          } else {
            console.log(`ℹ️ No custom wallet found for user ${userId}, using default .env wallet`);
          }

          result = await executeJupiterSwap(swap, customWallet);
        } else {
          throw new Error(`Unsupported chain type: ${chain.type}`);
        }

        // Update swap record
        if (result.success) {
          swap.processed = true;
          swap.processingTimestamp = new Date();
          swap.ourTxHash = result.txHash;
          swap.status = {
            code: "completed", // Using "completed" instead of "submitted" to match existing schema
            message: "Swap transaction submitted to the network",
          };
          await swap.save();

          // Register successful Solana copy trade for TP/SL monitoring
          if (swap.sourceChain === "solana" && result.success) {
            try {
              // result contains inputAmount and outputAmount for Solana swaps
              const entryPrice = result.inputAmount / result.outputAmount;
              const adminId = (wallet && wallet.addedBy) || process.env.TELEGRAM_ADMIN_ID || process.env.ADMIN_CHAT_ID;

              const position = new SnipeTarget({
                userId: adminId,
                tokenAddress: swap.tokenOut.address,
                tokenSymbol: swap.tokenOut.symbol || "UNKNOWN",
                tokenName: swap.tokenOut.name || "Copied Trade",
                targetAmount: result.inputAmount,
                maxSlippage: 15.0,
                isActive: false, // Don't re-execute as a snipe
                snipeStatus: "executed",
                executedAt: new Date(),
                executionPrice: entryPrice,
                amountReceived: result.outputAmount,
                transactionHash: result.txHash,
                notes: `[Copy Trade] Copied from ${swap.sourceWallet}`,
                autoSell: {
                  enabled: true,
                  takeProfitPercent: 75,
                  stopLossPercent: 20
                }
              });
              await position.save();
              console.log(`📈 Registered copy trade for TP/SL monitoring: ${swap.tokenOut.symbol}`);
            } catch (posError) {
              console.error("❌ Failed to register copy trade position:", posError.message);
            }
          }

          successCount++;
          console.log(`Swap submitted successfully: ${result.txHash}`);

          // Send success notification
          const notificationMessage = formatSwapNotification(
            swap,
            result.txHash,
            chain
          );
          await sendNotification(notificationMessage);
        } else {
          swap.status = {
            code: "failed",
            message: result.error,
          };
          await swap.save();

          failedCount++;
          console.log(`Swap execution failed: ${result.error}`);

          // Send failure notification if configured
          const notifyOnFailed = await BotConfig.findOne({
            setting: "notifyOnFailed",
          });
          if (notifyOnFailed && notifyOnFailed.value) {
            const errorMessage = formatErrorNotification(
              swap,
              result.error,
              chain
            );
            await sendNotification(errorMessage);
          }
        }
      } catch (error) {
        console.error(`Error processing swap ${swap.sourceTxHash}:`, error);
        failedCount++;

        // Update swap record with error
        swap.status = {
          code: "failed",
          message: error.message,
        };
        await swap.save();

        // Send failure notification if configured
        const notifyOnFailed = await BotConfig.findOne({
          setting: "notifyOnFailed",
        });
        if (notifyOnFailed && notifyOnFailed.value) {
          try {
            const chain = await Chain.findOne({ chainId: swap.sourceChain });
            const errorMessage = formatErrorNotification(
              swap,
              error.message,
              chain
            );
            await sendNotification(errorMessage);
          } catch (notifyError) {
            console.error("Error sending notification:", notifyError.message);
          }
        }
      }
    }

    // Print summary
    console.log(
      `Swap processing completed: ${successCount} submitted, ${failedCount} failed, ${skippedCount} skipped`
    );
  } catch (error) {
    console.error("Error processing swaps:", error);
    // Send error notification to the bot owner
    try {
      await sendNotification(`❌ Error processing swaps: ${error.message}`);
    } catch (e) {
      console.error("Error sending notification:", e.message);
    }
  } finally {
    isRunning = false;
  }
};

/**
 * Start the swap processor service
 */
const startSwapProcessor = async () => {
  try {
    // Initial processing
    await processSwaps();

    // Set up polling interval
    const pollFreq = parseInt(process.env.SWAP_PROCESSING_FREQ) || 30000; // Default: 30 seconds
    pollingInterval = setInterval(processSwaps, pollFreq);

    console.log(`Swap processor started with polling frequency: ${pollFreq}ms`);
    return true;
  } catch (error) {
    console.error("Error starting swap processor:", error);
    return false;
  }
};

/**
 * Stop the swap processor service
 */
const stopSwapProcessor = () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    console.log("Swap processor stopped");
    return true;
  }
  return false;
};

module.exports = {
  startSwapProcessor,
  stopSwapProcessor,
  processSwaps,
  sendNotification,
};
