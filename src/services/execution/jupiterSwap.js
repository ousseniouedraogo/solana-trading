// src/services/execution/jupiterSwap.js
const axios = require("axios");
const {
  Connection,
  PublicKey,
  VersionedTransaction,
} = require("@solana/web3.js");
const { getSolanaConnection, getSolanaWallet, checkSufficientBalance } = require("../wallets/solana");
const base58 = require("base-58");
require("dotenv").config();

// Execute a swap using Jupiter Ultra API for Solana
const executeJupiterSwap = async (swap, customWallet = null) => {
  try {
    console.log(
      `Executing Jupiter Ultra swap on Solana for tx: ${swap.sourceTxHash}`
    );

    const connection = getSolanaConnection();
    const wallet = customWallet || getSolanaWallet();
    const userPublicKey = wallet.publicKey.toString();

    // Get input and output tokens
    const fromToken = swap.tokenIn;
    const toToken = swap.tokenOut;

    console.log(
      `Swapping ${fromToken.amount} ${fromToken.symbol} to ${toToken.symbol}`
    );

    // Check if the token addresses are valid
    if (!fromToken.address || !toToken.address) {
      throw new Error(
        `Invalid token addresses: ${fromToken.address} -> ${toToken.address}`
      );
    }

    // Convert amount to the correct format (with decimals)
    const inputAmount = Math.floor(
      parseFloat(fromToken.amount) * Math.pow(10, fromToken.decimals)
    );
    if (isNaN(inputAmount) || inputAmount <= 0) {
      throw new Error(`Invalid amount: ${fromToken.amount}`);
    }

    // Check wallet balance using the new comprehensive balance checking
    try {
      console.log(`Checking balance for ${fromToken.symbol} (${fromToken.address})...`);

      const balanceInfo = await checkSufficientBalance(
        fromToken.address,
        fromToken.amount,
        fromToken.decimals,
        userPublicKey
      );

      console.log(`Current balance: ${balanceInfo.formattedBalance} ${fromToken.symbol}`);
      console.log(`Required amount: ${balanceInfo.formattedRequired} ${fromToken.symbol}`);

      if (!balanceInfo.hasBalance) {
        throw new Error(
          `Insufficient balance. Have ${balanceInfo.formattedBalance} ${fromToken.symbol}, need ${balanceInfo.formattedRequired} ${fromToken.symbol}`
        );
      }

      // For SPL tokens, check if token account exists
      if (fromToken.address !== "So11111111111111111111111111111111111111112" && !balanceInfo.tokenAccountExists) {
        throw new Error(
          `Token account does not exist for ${fromToken.symbol}. You need to create an associated token account first.`
        );
      }

      console.log(`✅ Balance check passed: ${balanceInfo.formattedBalance} ${fromToken.symbol} available`);
    } catch (balanceError) {
      console.error("Error checking balance:", balanceError);
      throw new Error(`Failed to verify balance: ${balanceError.message}`);
    }

    // Step 1: Get Order from Jupiter Ultra API
    console.log("Fetching order from Jupiter Ultra API...");

    const orderUrl = new URL("https://lite-api.jup.ag/ultra/v1/order");
    orderUrl.searchParams.append("inputMint", fromToken.address);
    orderUrl.searchParams.append("outputMint", toToken.address);
    orderUrl.searchParams.append("amount", inputAmount.toString());
    orderUrl.searchParams.append("taker", userPublicKey);

    const { data: orderResponse } = await axios.get(orderUrl.toString());

    if (!orderResponse || !orderResponse.transaction) {
      throw new Error(
        `Failed to get order from Jupiter Ultra: ${JSON.stringify(
          orderResponse
        )}`
      );
    }

    const expectedOutputAmount =
      orderResponse.outAmount / Math.pow(10, toToken.decimals);
    console.log(
      `Order received. Expected output: ${expectedOutputAmount} ${toToken.symbol}`
    );

    if (orderResponse.routePlan && orderResponse.routePlan.length > 0) {
      const route = orderResponse.routePlan
        .map((r) => r.swapInfo.label)
        .join(" -> ");
      console.log(`Route: ${route}`);
    }

    // Step 2: Sign Transaction
    const transactionBase64 = orderResponse.transaction;
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(transactionBase64, "base64")
    );

    // Sign the transaction
    transaction.sign([wallet]);

    // Serialize the transaction to base64 format
    const signedTransaction = Buffer.from(transaction.serialize()).toString(
      "base64"
    );

    // Step 3: Execute Order
    console.log("🚀 Submitting transaction to Jupiter Ultra API...");
    const executeStartTime = Date.now();

    const { data: executeResponse } = await axios.post(
      "https://lite-api.jup.ag/ultra/v1/execute",
      {
        signedTransaction: signedTransaction,
        requestId: orderResponse.requestId,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000 // 30 second timeout
      }
    );

    const executeTime = Date.now() - executeStartTime;
    console.log(`⏱️  Transaction execution took ${executeTime}ms`);

    // Handle response with enhanced error handling
    if (executeResponse.status === "Success") {
      console.log("✅ Jupiter swap executed successfully!");
      const inputAmount =
        executeResponse.inputAmountResult / Math.pow(10, fromToken.decimals);
      const outputAmount =
        executeResponse.outputAmountResult / Math.pow(10, toToken.decimals);

      console.log(`📊 Input: ${inputAmount} ${fromToken.symbol}`);
      console.log(`📊 Output: ${outputAmount} ${toToken.symbol}`);
      console.log(
        `🔗 Transaction: https://solscan.io/tx/${executeResponse.signature}`
      );

      // Optional: Wait for transaction confirmation
      let confirmationStatus = "submitted";
      let confirmationTime = null;

      try {
        console.log("⏳ Checking transaction confirmation...");
        const confirmationStartTime = Date.now();

        const connection = getSolanaConnection();
        const signature = executeResponse.signature;

        // Wait for confirmation with timeout
        const confirmation = await connection.confirmTransaction(signature, 'confirmed');

        if (confirmation.value.err) {
          console.warn(`⚠️  Transaction confirmed but with error: ${JSON.stringify(confirmation.value.err)}`);
          confirmationStatus = "failed";
        } else {
          confirmationTime = Date.now() - confirmationStartTime;
          confirmationStatus = "confirmed";
          console.log(`✅ Transaction confirmed in ${confirmationTime}ms`);
        }
      } catch (confirmError) {
        console.warn(`⚠️  Could not confirm transaction: ${confirmError.message}`);
        confirmationStatus = "timeout";
      }

      if (confirmationStatus === "confirmed") {
        return {
          success: true,
          txHash: executeResponse.signature,
          message: `Transaction executed and confirmed successfully: ${inputAmount} ${fromToken.symbol} → ${outputAmount} ${toToken.symbol}`,
          inputAmount,
          outputAmount,
          explorerUrl: `https://solscan.io/tx/${executeResponse.signature}`,
          confirmationStatus,
          confirmationTime,
          executionTime: executeTime
        };
      } else {
        console.warn(`❌ Transaction ${confirmationStatus}: ${executeResponse.signature}`);
        return {
          success: false,
          txHash: executeResponse.signature,
          error: `Transaction ${confirmationStatus === 'failed' ? 'failed on-chain' : 'failed to confirm (timeout)'}`,
          confirmationStatus,
          executionTime: executeTime
        };
      }
    } else {
      // Enhanced error handling for different failure types
      let errorMessage = "Swap execution failed";

      if (executeResponse.error) {
        errorMessage = executeResponse.error;
      } else if (executeResponse.message) {
        errorMessage = executeResponse.message;
      } else if (executeResponse.status) {
        errorMessage = `Swap failed with status: ${executeResponse.status}`;
      }

      console.error(`❌ Jupiter swap failed: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  } catch (error) {
    console.error("❌ Error executing Jupiter Ultra swap:", error);

    // Enhanced error categorization
    let errorCategory = "Unknown";
    let userFriendlyMessage = error.message;

    if (error.message.includes("Insufficient balance")) {
      errorCategory = "Balance";
      userFriendlyMessage = "Insufficient balance to execute the swap";
    } else if (error.message.includes("Token account does not exist")) {
      errorCategory = "TokenAccount";
      userFriendlyMessage = "Token account needs to be created first";
    } else if (error.message.includes("Invalid token addresses")) {
      errorCategory = "TokenAddress";
      userFriendlyMessage = "Invalid token addresses provided";
    } else if (error.message.includes("Failed to get order")) {
      errorCategory = "Jupiter";
      userFriendlyMessage = "Jupiter API failed to create swap order";
    } else if (error.response && error.response.status === 429) {
      errorCategory = "RateLimit";
      userFriendlyMessage = "Rate limited by Jupiter API, please try again later";
    } else if (error.message.includes("network") || error.message.includes("connection")) {
      errorCategory = "Network";
      userFriendlyMessage = "Network connection error, please try again";
    }

    console.error(`🏷️  Error category: ${errorCategory}`);

    return {
      success: false,
      error: userFriendlyMessage,
      errorCategory,
      originalError: error.message,
    };
  }
};

module.exports = {
  executeJupiterSwap,
};
