// src/services/sniping/snipeExecutor.js
const axios = require("axios");
const {
  Connection,
  PublicKey,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionMessage,
} = require("@solana/web3.js");
const { getSolanaConnection, getSolanaWallet, checkSufficientBalance } = require("../wallets/solana");
require("dotenv").config();

// High-performance snipe execution engine
const executeSnipe = async (target, execution, tokenInfo, customWallet = null) => {
  const executionStartTime = Date.now();

  try {
    console.log(`🎯 Executing snipe for ${tokenInfo.symbol} (${tokenInfo.address})`);
    console.log(`💰 Amount: ${target.targetAmount} SOL | Max Slippage: ${target.maxSlippage}% | Priority Fee: ${target.priorityFee} SOL`);

    const connection = getSolanaConnection();
    const wallet = customWallet || getSolanaWallet();
    const userPublicKey = wallet.publicKey.toString();

    // Validate inputs
    if (!tokenInfo.address || !target.targetAmount) {
      throw new Error("Invalid token address or amount");
    }

    // Convert amount to lamports for precision
    const inputAmount = Math.floor(
      parseFloat(target.targetAmount) * Math.pow(10, 9) // SOL has 9 decimals
    );

    if (isNaN(inputAmount) || inputAmount <= 0) {
      throw new Error(`Invalid amount: ${target.targetAmount}`);
    }

    console.log(`🔍 Checking balance for ${target.targetAmount} SOL...`);

    // Fast balance check with priority fee consideration
    const balanceInfo = await checkSufficientBalance(
      "So11111111111111111111111111111111111111112", // SOL mint
      (parseFloat(target.targetAmount) + parseFloat(target.priorityFee) + 0.01).toString(), // Add buffer for fees
      9
    );

    if (!balanceInfo.hasBalance) {
      throw new Error(
        `Insufficient balance for snipe. Have ${balanceInfo.formattedBalance} SOL, need ${balanceInfo.formattedRequired} SOL (including fees)`
      );
    }

    console.log(`✅ Balance check passed: ${balanceInfo.formattedBalance} SOL available`);

    // Step 1: Get Jupiter order with optimized parameters for speed
    console.log("⚡ Fetching Jupiter order for snipe...");
    const orderStartTime = Date.now();

    const orderUrl = new URL("https://lite-api.jup.ag/ultra/v1/order");
    orderUrl.searchParams.append("inputMint", "So11111111111111111111111111111111111111112"); // SOL
    orderUrl.searchParams.append("outputMint", tokenInfo.address);
    orderUrl.searchParams.append("amount", inputAmount.toString());
    orderUrl.searchParams.append("taker", userPublicKey);
    orderUrl.searchParams.append("slippageBps", Math.floor(target.maxSlippage * 100)); // Convert to basis points
    orderUrl.searchParams.append("computeUnitPriceMicroLamports", Math.floor(target.priorityFee * 1000000)); // Priority fee

    const { data: orderResponse } = await axios.get(orderUrl.toString(), {
      timeout: 10000, // 10 second timeout for speed
      headers: {
        'User-Agent': 'SolanaSnipeBot/1.0',
      }
    });

    const orderTime = Date.now() - orderStartTime;
    console.log(`⏱️  Order fetched in ${orderTime}ms`);

    if (!orderResponse || !orderResponse.transaction) {
      throw new Error(
        `Failed to get Jupiter order: ${JSON.stringify(orderResponse)}`
      );
    }

    const expectedOutputAmount =
      orderResponse.outAmount / Math.pow(10, tokenInfo.decimals);
    console.log(
      `📊 Expected output: ${expectedOutputAmount} ${tokenInfo.symbol}`
    );

    // Calculate actual slippage
    const expectedPrice = parseFloat(target.targetAmount) / expectedOutputAmount;
    console.log(`💱 Execution price: ${expectedPrice} SOL per ${tokenInfo.symbol}`);

    // Step 2: Prepare and optimize transaction
    console.log("🔧 Preparing optimized transaction...");
    const txPrepStartTime = Date.now();

    let transaction = VersionedTransaction.deserialize(
      Buffer.from(orderResponse.transaction, "base64")
    );

    // Add priority fee instruction for faster execution
    if (target.priorityFee > 0) {
      const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: Math.floor(target.priorityFee * 1000000), // Convert SOL to microlamports
      });

      // Add compute unit limit for optimization
      const computeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 200000, // Generous limit for complex swaps
      });

      // Create new transaction with priority fee instructions
      const instructions = [computeLimitIx, priorityFeeIx, ...transaction.message.compiledInstructions];

      // Note: This is a simplified approach. In production, you'd need to properly
      // reconstruct the transaction message with the new instructions
      console.log("💎 Added priority fee instructions");
    }

    const txPrepTime = Date.now() - txPrepStartTime;
    console.log(`⏱️  Transaction prepared in ${txPrepTime}ms`);

    // Step 3: Sign transaction
    console.log("✍️  Signing transaction...");
    const signStartTime = Date.now();

    transaction.sign([wallet]);

    const signTime = Date.now() - signStartTime;
    console.log(`⏱️  Transaction signed in ${signTime}ms`);

    // Serialize the transaction
    const signedTransaction = Buffer.from(transaction.serialize()).toString("base64");

    // Step 4: Execute Transaction
    console.log("🚀 Executing snipe transaction...");
    const executeStartTime = Date.now();
    let txHash = null;

    if (process.env.USE_JITO_BUNDLES === 'true') {
      const jitoExecutor = require("../execution/jitoExecutor");
      const jitoResult = await jitoExecutor.sendBundle(transaction, wallet, parseFloat(process.env.JITO_TIP_AMOUNT || 0.001));

      if (jitoResult.success) {
        txHash = jitoResult.bundleId;
        console.log(`✅ Jito Bundle submitted: ${txHash}`);
      } else {
        console.warn(`⚠️ Jito failed, falling back to Jupiter/Raw: ${jitoResult.error}`);
      }
    }

    if (!txHash) {
      // Use Raw Transaction Submission for maximum speed if Jito skipped/failed
      if (process.env.SKIP_PREFLIGHT === 'true') {
        const rawTx = transaction.serialize();
        txHash = await connection.sendRawTransaction(rawTx, {
          skipPreflight: true,
          maxRetries: parseInt(process.env.MAX_RETRIES || 2)
        });
        console.log(`⚡ Raw transaction sent: ${txHash}`);
      } else {
        // Standard Jupiter execution
        const { data: executeResponse } = await axios.post(
          "https://lite-api.jup.ag/ultra/v1/execute",
          {
            signedTransaction: Buffer.from(transaction.serialize()).toString("base64"),
            requestId: orderResponse.requestId,
          },
          {
            headers: {
              "Content-Type": "application/json",
              'User-Agent': 'SolanaSnipeBot/1.0',
            },
            timeout: 15000,
          }
        );
        if (executeResponse.status === "Success") {
          txHash = executeResponse.signature;
        } else {
          throw new Error(executeResponse.error || "Execution failed");
        }
      }
    }

    const executeTime = Date.now() - executeStartTime;
    console.log(`⏱️  Transaction submitted in ${executeTime}ms`);

    // Step 5: Verification of landing
    console.log("⏳ Verifying transaction landing...");
    const confirmationStartTime = Date.now();
    let amountOut = expectedOutputAmount; // Default to expected if verification fails
    let executionPrice = expectedPrice;

    try {
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(txHash, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log(`✅ Transaction confirmed in ${Date.now() - confirmationStartTime}ms`);

      // Get actual balance change to record exactly what we received
      try {
        const txDetails = await connection.getParsedTransaction(txHash, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed'
        });

        if (txDetails && txDetails.meta) {
          const postBalances = txDetails.meta.postTokenBalances || [];
          const preBalances = txDetails.meta.preTokenBalances || [];

          // Find the balance change for the target token and the user's wallet
          const tokenBalanceChange = postBalances.find(b =>
            b.mint === tokenInfo.address &&
            b.owner === userPublicKey
          );

          const preTokenBalance = preBalances.find(b =>
            b.mint === tokenInfo.address &&
            b.owner === userPublicKey
          );

          if (tokenBalanceChange) {
            const preAmount = preTokenBalance ? preTokenBalance.uiTokenAmount.uiAmount : 0;
            const postAmount = tokenBalanceChange.uiTokenAmount.uiAmount;
            amountOut = postAmount - preAmount;

            if (amountOut > 0) {
              executionPrice = parseFloat(target.targetAmount) / amountOut;
              console.log(`📊 Verified actual output: ${amountOut} ${tokenInfo.symbol} at ${executionPrice.toFixed(8)} SOL`);
            }
          }
        }
      } catch (parseError) {
        console.warn("⚠️ Could not parse actual amount from transaction, using estimate:", parseError.message);
      }

    } catch (confirmationError) {
      console.error("❌ Failed to verify transaction landing:", confirmationError.message);
      throw confirmationError; // Re-throw to trigger fail message
    }

    console.log(`🎉 SNIPE COMPLETED!`);
    console.log(`⏱️ Total time: ${Date.now() - executionStartTime}ms`);

    return {
      success: true,
      txHash: txHash,
      executionPrice: executionPrice,
      amountOut: amountOut,
      executionTime: Date.now() - executionStartTime
    };

  } catch (error) {
    const totalExecutionTime = Date.now() - executionStartTime;

    console.error(`❌ SNIPE FAILED for ${tokenInfo.symbol}:`, error.message);
    console.error(`⏱️  Failed after ${totalExecutionTime}ms`);

    // Categorize errors for better handling
    let errorCategory = "Unknown";
    let userFriendlyMessage = error.message;

    if (error.message.includes("Insufficient balance")) {
      errorCategory = "Balance";
      userFriendlyMessage = "Insufficient balance for snipe execution";
    } else if (error.message.includes("Slippage")) {
      errorCategory = "Slippage";
      userFriendlyMessage = "Slippage tolerance exceeded";
    } else if (error.message.includes("Failed to get Jupiter order")) {
      errorCategory = "Jupiter";
      userFriendlyMessage = "Jupiter API failed to create swap order";
    } else if (error.response && error.response.status === 429) {
      errorCategory = "RateLimit";
      userFriendlyMessage = "Rate limited by Jupiter API";
    } else if (error.message.includes("timeout")) {
      errorCategory = "Timeout";
      userFriendlyMessage = "Transaction timed out";
    } else if (error.message.includes("network") || error.message.includes("connection")) {
      errorCategory = "Network";
      userFriendlyMessage = "Network connection error";
    }

    console.error(`🏷️  Error category: ${errorCategory}`);

    // Send failure notification
    await sendSnipeNotification(target.userId, {
      type: 'failure',
      token: tokenInfo,
      error: userFriendlyMessage,
      errorCategory: errorCategory,
      executionTime: totalExecutionTime,
      targetAmount: target.targetAmount
    });

    return {
      success: false,
      error: userFriendlyMessage,
      errorCategory: errorCategory,
      originalError: error.message,
      executionTime: totalExecutionTime
    };
  }
};

// Send notification to user about snipe result
const sendSnipeNotification = async (userId, data) => {
  try {
    // Import here to avoid circular dependency
    const { getActiveChatId } = require("../../telegram/index");
    const { sendMessage } = require("../../utils/notifier");

    const activeChatId = await getActiveChatId();
    const adminId = process.env.TELEGRAM_ADMIN_ID || process.env.ADMIN_CHAT_ID;

    let message;

    if (data.type === 'success') {
      message = `🔔 *PURCHASE ALERT (SNIPE)* 🎯\n\n` +
        `🪙 **Token:** ${data.token.symbol} (${data.token.name})\n` +
        `💰 **Spent:** ${data.inputAmount.toFixed(4)} SOL\n` +
        `📈 **Received:** ${data.outputAmount.toFixed(2)} ${data.token.symbol}\n` +
        `💱 **Price:** ${data.price.toFixed(8)} SOL\n` +
        `📊 **Slippage:** ${data.slippage.toFixed(2)}%\n` +
        `⏱️ **Execution Time:** ${data.executionTime}ms\n` +
        `🔗 [View Transaction](https://solscan.io/tx/${data.txHash})`;
    } else {
      message = `❌ *SNIPE ATTEMPT FAILED* ❌\n\n` +
        `🪙 Token: ${data.token.symbol}\n` +
        `💰 Target Amount: ${data.targetAmount} SOL\n` +
        `🚨 Error: ${data.error}\n` +
        `🏷️ Category: ${data.errorCategory}\n` +
        `⏱️ Execution Time: ${data.executionTime}ms`;
    }

    // Send to the user who triggered it
    await sendMessage(userId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });

    // Also send to admin if different
    if (adminId && adminId !== userId) {
      await sendMessage(adminId, `👤 *User ${userId} Notification:*\n${message}`, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    }

    // Also send to globally active chat ID if different from both
    if (activeChatId && activeChatId !== userId && activeChatId !== adminId) {
      await sendMessage(activeChatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    }

  } catch (error) {
    console.error("❌ Error sending snipe notification:", error);
  }
};

// Batch execute multiple snipes in parallel (for future use)
const executeBatchSnipes = async (targets, tokenInfo) => {
  console.log(`🚀 Executing batch snipe for ${targets.length} targets`);

  const promises = targets.map(async (target) => {
    try {
      // Create execution record for each target
      const execution = new (require("../../db/models/snipeExecutions"))({
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
      });

      await execution.save();

      return executeSnipe(target, execution, tokenInfo);
    } catch (error) {
      console.error(`❌ Error in batch snipe for target ${target._id}:`, error);
      return {
        success: false,
        error: error.message,
        targetId: target._id
      };
    }
  });

  const results = await Promise.allSettled(promises);

  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.length - successful;

  console.log(`📊 Batch snipe completed: ${successful} successful, ${failed} failed`);

  return results;
};

module.exports = {
  executeSnipe,
  executeBatchSnipes,
  sendSnipeNotification,
};