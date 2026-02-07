// src/services/moralis/evmSwaps.js
const axios = require("axios");
require("dotenv").config();

// Native token addresses for EVM chains
const NATIVE_TOKEN_ADDRESSES = {
  eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  base: "0x4200000000000000000000000000000000000006",
  polygon: "0x0000000000000000000000000000000000001010",
  arbitrum: "0x912CE59144191C1204E64559FE8253a0e49E6548",
  optimism: "0x4200000000000000000000000000000000000006",
  avalanche: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
};

const getEvmSwaps = async (walletAddress, chain, limit = 100) => {
  try {
    const response = await axios.get(
      `https://deep-index.moralis.io/api/v2.2/wallets/${walletAddress}/swaps`,
      {
        params: {
          chain: chain.moralisChainName,
          order: "DESC",
          limit,
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
      // Normalize the data structure and fix token addresses
      // Fix token addresses for native tokens
      const tokenIn = { ...swap.sold };
      const tokenOut = { ...swap.bought };

      // For native tokens, Moralis often returns 0x000... which can cause issues
      // Use the proper native token address for the chain, but don't log every occurrence
      if (
        tokenIn.address === "0x0000000000000000000000000000000000000000" &&
        (tokenIn.symbol === "ETH" ||
          tokenIn.symbol === "MATIC" ||
          tokenIn.symbol === "AVAX")
      ) {
        // Update address without logging
        tokenIn.address =
          NATIVE_TOKEN_ADDRESSES[chain.chainId] || tokenIn.address;
      }

      if (
        tokenOut.address === "0x0000000000000000000000000000000000000000" &&
        (tokenOut.symbol === "ETH" ||
          tokenOut.symbol === "MATIC" ||
          tokenOut.symbol === "AVAX")
      ) {
        // Update address without logging
        tokenOut.address =
          NATIVE_TOKEN_ADDRESSES[chain.chainId] || tokenOut.address;
      }

      // Return normalized swap data without logging each swap
      return {
        sourceWallet: walletAddress,
        sourceChain: chain.chainId,
        sourceTxHash: swap.transactionHash,
        sourceTimestamp: new Date(swap.blockTimestamp),
        tokenIn: {
          address: tokenIn.address,
          symbol: tokenIn.symbol || "Unknown",
          name: tokenIn.name || "Unknown Token",
          amount: tokenIn.amount.toString().replace("-", ""), // Remove the negative sign
          decimals: tokenIn.decimals || getDefaultDecimals(tokenIn.symbol),
        },
        tokenOut: {
          address: tokenOut.address,
          symbol: tokenOut.symbol || "Unknown",
          name: tokenOut.name || "Unknown Token",
          amount: tokenOut.amount.toString(),
          decimals: tokenOut.decimals || getDefaultDecimals(tokenOut.symbol),
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
      `Error fetching EVM swaps for ${walletAddress} on ${chain.chainId}:`,
      error.message
    );
    return [];
  }
};

// Helper function to get default decimals for common tokens
const getDefaultDecimals = (symbol) => {
  const defaults = {
    ETH: 18,
    WETH: 18,
    USDC: 6,
    USDT: 6,
    DAI: 18,
    WBTC: 8,
    MATIC: 18,
  };

  return defaults[symbol] || 18; // Default to 18 if unknown
};

module.exports = {
  getEvmSwaps,
};
