// src/services/moralis/solanaSwaps.js
const axios = require("axios");
require("dotenv").config();

const getSolanaSwaps = async (walletAddress, limit = 100) => {
  try {
    const response = await axios.get(
      `https://solana-gateway.moralis.io/account/mainnet/${walletAddress}/swaps`,
      {
        params: {
          order: "DESC",
          limit,
          transactionTypes: "buy,sell",
        },
        headers: {
          accept: "application/json",
          "X-API-Key": process.env.MORALIS_API_KEY,
        },
      }
    );

    if (!response.data || !response.data.result) {
      return [];
    }

    return response.data.result.map((swap) => {
      // Normalize the data structure
      const isBuy = swap.transactionType === "buy";

      // For Solana, the buy/sell is from the perspective of the token,
      // so we need to determine which tokens are in/out
      const tokenIn = isBuy ? swap.sold : swap.bought;
      const tokenOut = isBuy ? swap.bought : swap.sold;

      return {
        sourceWallet: walletAddress,
        sourceChain: "solana",
        sourceTxHash: swap.transactionHash,
        sourceTimestamp: new Date(swap.blockTimestamp),
        tokenIn: {
          address: tokenIn.address,
          symbol: tokenIn.symbol || "Unknown",
          name: tokenIn.name || "Unknown Token",
          amount: tokenIn.amount.toString().replace("-", ""), // Remove any negative sign
          decimals: getSolanaTokenDecimals(tokenIn.symbol),
        },
        tokenOut: {
          address: tokenOut.address,
          symbol: tokenOut.symbol || "Unknown",
          name: tokenOut.name || "Unknown Token",
          amount: tokenOut.amount.toString(),
          decimals: getSolanaTokenDecimals(tokenOut.symbol),
        },
        usdValue: Math.abs(swap.totalValueUsd),
        exchangeInfo: {
          name: swap.exchangeName || "Unknown Exchange",
          address: swap.exchangeAddress || "",
          pairAddress: swap.pairAddress || "",
        },
      };
    });
  } catch (error) {
    console.error(
      `Error fetching Solana swaps for ${walletAddress}:`,
      error.message
    );
    return [];
  }
};

// Helper function to get default decimals for Solana tokens
const getSolanaTokenDecimals = (symbol) => {
  const defaults = {
    SOL: 9,
    USDC: 6,
    USDT: 6,
    BTC: 6,
    ETH: 6,
    RAY: 6,
    SRM: 6,
  };

  return defaults[symbol] || 9; // Default to 9 if unknown
};

module.exports = {
  getSolanaSwaps,
};
