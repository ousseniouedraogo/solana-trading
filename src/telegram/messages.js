// src/telegram/messages.js
// Helper functions for formatting messages

/**
 * Format an address for display (shortened)
 */
const formatAddress = (address) => {
  if (!address) return "";

  // Handle both EVM and Solana addresses
  if (address.length > 20) {
    return `${address.substring(0, 6)}...${address.substring(
      address.length - 4
    )}`;
  }

  return address;
};

/**
 * Get the appropriate transaction URL based on chain data
 * @param {string} txHash - Transaction hash
 * @param {object} chain - Chain data from database
 * @returns {string} - Full transaction URL
 */
const getTransactionUrl = (txHash, chain) => {
  if (!txHash) return "";

  // Use chain's blockExplorer from database
  const explorer =
    chain.blockExplorer || getDefaultExplorer(chain.type, chain.chainId);

  // Build the URL - handles both trailing slashes and no trailing slashes
  const baseUrl = explorer.endsWith("/") ? explorer.slice(0, -1) : explorer;
  return `${baseUrl}/tx/${txHash}`;
};

/**
 * Get the address URL for a wallet on the appropriate block explorer
 * @param {string} address - Wallet address
 * @param {object} chain - Chain data from database
 * @returns {string} - Full address URL
 */
const getAddressUrl = (address, chain) => {
  if (!address) return "";

  // Use chain's blockExplorer from database
  const explorer =
    chain.blockExplorer || getDefaultExplorer(chain.type, chain.chainId);

  // Build the URL - handles both trailing slashes and no trailing slashes
  const baseUrl = explorer.endsWith("/") ? explorer.slice(0, -1) : explorer;

  // Different paths for different explorer types
  if (chain.type === "solana") {
    return `${baseUrl}/account/${address}`;
  } else {
    // Default EVM format
    return `${baseUrl}/address/${address}`;
  }
};

/**
 * Get a default explorer URL if not specified in the chain data
 * @param {string} chainType - The type of chain (evm, solana, etc.)
 * @param {string} chainId - The chain ID
 * @returns {string} - Default explorer URL
 */
const getDefaultExplorer = (chainType, chainId) => {
  // Default explorers based on chain type and ID
  const defaultExplorers = {
    evm: {
      eth: "https://etherscan.io",
      base: "https://basescan.org",
      polygon: "https://polygonscan.com",
      arbitrum: "https://arbiscan.io",
      optimism: "https://optimistic.etherscan.io",
      avalanche: "https://snowtrace.io",
      default: "https://etherscan.io",
    },
    solana: {
      default: "https://solscan.io",
    },
    default: "https://etherscan.io",
  };

  // Get the explorer for the specific chain if available
  if (chainType && defaultExplorers[chainType]) {
    return (
      defaultExplorers[chainType][chainId] ||
      defaultExplorers[chainType]["default"]
    );
  }

  // Fallback to default explorer
  return defaultExplorers["default"];
};

/**
 * Format a number with appropriate decimals based on value
 * @param {number} num - The number to format
 * @returns {string} - Formatted number
 */
const formatNumber = (num) => {
  const value = parseFloat(num);

  // For very small numbers, show more decimal places
  if (value < 0.001) return value.toFixed(8);
  // For small numbers, show 6 decimal places
  if (value < 1) return value.toFixed(6);
  // For medium numbers, show 4 decimal places
  if (value < 1000) return value.toFixed(4);
  // For large numbers, show 2 decimal places
  if (value < 1000000) return value.toFixed(2);
  // For very large numbers, show commas for thousands
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
};

/**
 * Format token amount with appropriate decimal places
 * @param {string|number} amount - Token amount
 * @param {string} symbol - Token symbol
 * @returns {string} - Formatted amount
 */
const formatTokenAmount = (amount, symbol) => {
  const value = parseFloat(amount);

  // Use more specific formatting based on token type
  if (symbol === "USDC" || symbol === "USDT" || symbol === "DAI") {
    // Stablecoins typically show 2 decimal places
    return value.toFixed(2);
  } else if (
    symbol === "ETH" ||
    symbol === "WETH" ||
    symbol === "MATIC" ||
    symbol === "SOL"
  ) {
    // Major coins typically show 4-6 decimal places
    return value < 1 ? value.toFixed(6) : value.toFixed(4);
  } else {
    // For other tokens, use the dynamic formatter
    return formatNumber(value);
  }
};

const formatSwapNotification = (swap, ourTxHash, chain) => {
  const { sourceWallet, tokenIn, tokenOut, usdValue, sourceTimestamp } = swap;

  // Get transaction URLs using chain data
  const sourceTxUrl = getTransactionUrl(swap.sourceTxHash, chain);
  const ourTxUrl = getTransactionUrl(ourTxHash, chain);

  // Get address URL for the wallet
  const walletUrl = getAddressUrl(sourceWallet, chain);

  // Format wallet address with link
  const shortAddress = formatAddress(sourceWallet);
  const walletLink = `[${shortAddress}](${walletUrl})`;

  // Format token amounts
  const inAmount = formatTokenAmount(tokenIn.amount, tokenIn.symbol);
  const outAmount = formatTokenAmount(tokenOut.amount, tokenOut.symbol);

  // Format timestamps
  const originalTime = new Date(sourceTimestamp).toLocaleString();
  const processTime = new Date().toLocaleString();

  return `
🔔 *PURCHASE ALERT (COPY TRADE)* 📋

*Network:* ${chain.name}
*Wallet:* ${walletLink}
*Swap:* ${inAmount} ${tokenIn.symbol} → ${outAmount} ${tokenOut.symbol}
*Value:* $${parseFloat(usdValue).toFixed(2)}

*Original TX:* [View on Explorer](${sourceTxUrl})
*Our TX:* [View on Explorer](${ourTxUrl})

⏱️ *Time:* ${originalTime}
⌛ *Processed:* ${processTime}
`;
};

const formatErrorNotification = (swap, errorMessage, chain) => {
  const { sourceWallet, tokenIn, tokenOut, usdValue, sourceTimestamp } = swap;

  // Get transaction URL using chain data
  const sourceTxUrl = getTransactionUrl(swap.sourceTxHash, chain);

  // Get address URL for the wallet
  const walletUrl = getAddressUrl(sourceWallet, chain);

  // Format wallet address with link
  const shortAddress = formatAddress(sourceWallet);
  const walletLink = `[${shortAddress}](${walletUrl})`;

  // Format token amounts
  const inAmount = formatTokenAmount(tokenIn.amount, tokenIn.symbol);

  // Format timestamps
  const originalTime = new Date(sourceTimestamp).toLocaleString();
  const processTime = new Date().toLocaleString();

  return `
❌ *SWAP FAILED* ❌

*Network:* ${chain.name}
*Wallet:* ${walletLink}
*Attempted:* ${inAmount} ${tokenIn.symbol} → ${tokenOut.symbol}
*Value:* $${parseFloat(usdValue).toFixed(2)}

*Original TX:* [View on Explorer](${sourceTxUrl})
*Error:* ${errorMessage}

⏱️ *Time:* ${originalTime}
⌛ *Processed:* ${processTime}
`;
};

/**
 * Format a bot status message
 */
const formatBotStatus = (status) => {
  const {
    botStatus,
    chainCount,
    activeChainCount,
    walletCount,
    activeWalletCount,
    processedSwapCount,
    pendingSwapCount,
    failedSwapCount,
  } = status;

  const statusEmoji = botStatus === "running" ? "🟢" : "🔴";

  return `
*BOT STATUS*: ${statusEmoji} ${botStatus.toUpperCase()}

📊 *Statistics*
*Chains:* ${activeChainCount}/${chainCount} active
*Wallets:* ${activeWalletCount}/${walletCount} active
*Swaps:* ${processedSwapCount} processed, ${pendingSwapCount} pending, ${failedSwapCount} failed

Use /help to see available commands
`;
};

/**
 * Format a wallet balance message
 */
const formatWalletBalance = (balanceData, chain) => {
  const { address, native, tokens } = balanceData;

  // Get address URL
  const addressUrl = getAddressUrl(address, chain);

  // Format native token
  const shortAddress = formatAddress(address);
  const addressLink = `[${shortAddress}](${addressUrl})`;
  const nativeBalance = `${formatNumber(native.amount)} ${native.symbol}`;

  // Only add USD value if available and not Solana (as requested)
  let nativeValue = "";
  if (native.usdValue && chain.chainId !== "solana") {
    nativeValue = ` ($${parseFloat(native.usdValue).toFixed(2)})`;
  }

  // Format tokens list
  let tokensList = "";
  if (tokens && tokens.length > 0) {
    tokensList = "\n\n*Tokens:*\n";
    tokens.forEach((token) => {
      const tokenAmount = formatNumber(token.amount);

      // Only add USD value if available
      let tokenValue = "";
      if (token.usdValue) {
        tokenValue = ` ($${parseFloat(token.usdValue).toFixed(2)})`;
      }

      // Add token link if we have the explorer
      let tokenSymbol = token.symbol;
      if (token.address && chain.blockExplorer) {
        const tokenUrl = `${chain.blockExplorer.replace(/\/$/, "")}/token/${token.address
          }`;
        tokenSymbol = `[${token.symbol}](${tokenUrl})`;
      }

      tokensList += `• ${tokenAmount} ${tokenSymbol}${tokenValue}\n`;
    });
  }

  return `
*WALLET BALANCE* 💰

*Chain:* ${chain.name}
*Address:* ${addressLink}

*Native Balance:*
${nativeBalance}${nativeValue}${tokensList}
`;
};

/**
 * Format a wallet list message
 */
const formatWalletList = (wallets, chains) => {
  if (wallets.length === 0) {
    return "*NO TRACKED WALLETS*\n\nUse /add <address> <chain> to add a wallet.";
  }

  let message = "*TRACKED WALLETS* 📋\n\n";

  wallets.forEach((wallet, index) => {
    // Find the chain name and data
    const chain = chains.find((c) => c.chainId === wallet.chain);
    const chainName = chain ? chain.name : wallet.chain;

    // Format wallet info
    const shortAddress = formatAddress(wallet.address);

    // Add clickable address if we have the chain data
    let addressText = shortAddress;
    if (chain && chain.blockExplorer) {
      const addressUrl = getAddressUrl(wallet.address, chain);
      addressText = `[${shortAddress}](${addressUrl})`;
    }

    const status = wallet.isActive ? "🟢 Active" : "🔴 Inactive";
    const lastChecked = wallet.lastChecked
      ? new Date(wallet.lastChecked).toLocaleString()
      : "Never";

    message += `${index + 1}. ${addressText} on ${chainName}\n`;
    message += `   *Status:* ${status}\n`;
    message += `   *Last checked:* ${lastChecked}\n\n`;
  });

  return message;
};

module.exports = {
  formatAddress,
  formatSwapNotification,
  formatErrorNotification,
  formatBotStatus,
  formatWalletBalance,
  formatWalletList,
  getTransactionUrl,
  getAddressUrl,
};
