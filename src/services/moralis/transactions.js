// src/services/moralis/transactions.js
const axios = require("axios");
require("dotenv").config();

const getEvmTransactions = async (walletAddress, chain, limit = 10) => {
  try {
    const response = await axios.get(
      `https://deep-index.moralis.io/api/v2.2/${walletAddress}`,
      {
        params: {
          chain: chain.moralisChainName,
          limit,
          order: "DESC",
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

    return response.data.result.map((tx) => ({
      hash: tx.hash,
      blockNumber: tx.block_number,
      timestamp: new Date(tx.block_timestamp),
      from: tx.from_address,
      to: tx.to_address,
      value: tx.value,
      gasUsed: tx.gas_used,
      gasPrice: tx.gas_price,
      status: tx.receipt_status === "1" ? "success" : "failed",
      chain: chain.chainId,
      explorerUrl: `${chain.blockExplorer}/tx/${tx.hash}`,
    }));
  } catch (error) {
    console.error(
      `Error fetching EVM transactions for ${walletAddress} on ${chain.chainId}:`,
      error.message
    );
    return [];
  }
};

const getSolanaTransactions = async (walletAddress, limit = 10) => {
  try {
    const response = await axios.get(
      `https://solana-gateway.moralis.io/account/mainnet/${walletAddress}/transactions`,
      {
        params: {
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

    return response.data.result.map((tx) => ({
      hash: tx.transactionHash,
      blockNumber: tx.slot,
      timestamp: new Date(tx.blockTimestamp),
      from: tx.feePayer,
      to: tx.signers?.[0] || "N/A",
      value: "0", // Solana doesn't have a simple value field
      fee: tx.fee,
      status: tx.transactionStatus === "Success" ? "success" : "failed",
      chain: "solana",
      explorerUrl: `https://solscan.io/tx/${tx.transactionHash}`,
    }));
  } catch (error) {
    console.error(
      `Error fetching Solana transactions for ${walletAddress}:`,
      error.message
    );
    return [];
  }
};

const formatTransactionList = (transactions, walletAddress) => {
  if (transactions.length === 0) {
    return `📭 No recent transactions found for wallet \`${walletAddress}\`.`;
  }

  let message = `📋 *Recent Transactions for* \`${walletAddress}\`:\n\n`;

  transactions.forEach((tx, index) => {
    const date = tx.timestamp.toLocaleString();
    const status = tx.status === "success" ? "✅" : "❌";
    const chain = tx.chain.toUpperCase();
    
    // Truncate hash for display
    const shortHash = `${tx.hash.substring(0, 8)}...${tx.hash.substring(tx.hash.length - 6)}`;
    
    // Format value based on chain
    let valueStr = "";
    if (tx.chain === "solana") {
      valueStr = tx.fee ? `Fee: ${(parseInt(tx.fee) / 1000000000).toFixed(6)} SOL` : "";
    } else {
      const ethValue = parseInt(tx.value) / Math.pow(10, 18);
      valueStr = ethValue > 0 ? `${ethValue.toFixed(6)} ETH` : "Contract Call";
    }

    message += `${index + 1}. ${status} *${chain}* - ${shortHash}\n`;
    message += `   📅 ${date}\n`;
    if (valueStr) {
      message += `   💰 ${valueStr}\n`;
    }
    message += `   🔗 [View on Explorer](${tx.explorerUrl})\n\n`;
  });

  return message;
};

module.exports = {
  getEvmTransactions,
  getSolanaTransactions,
  formatTransactionList,
};