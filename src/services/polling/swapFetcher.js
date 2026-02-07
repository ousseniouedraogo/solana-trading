// src/services/polling/swapFetcher.js
const { getEvmSwaps } = require("../moralis/evmSwaps");
const { getSolanaSwaps } = require("../moralis/solanaSwaps");
const TrackedWallet = require("../../db/models/trackedWallets");
const Chain = require("../../db/models/chains");
const Swap = require("../../db/models/swaps");
const BotConfig = require("../../db/models/botConfig");
const { getBot } = require("../../telegram");
const { sendNotification } = require("./swapProcessor");

let isRunning = false;
let pollingInterval;

// Time window for fetching recent swaps (5 minutes in milliseconds)
const RECENT_SWAPS_WINDOW = 5 * 60 * 1000;

const fetchNewSwaps = async () => {
  // Skip if already running to prevent overlap
  if (isRunning) return;
  isRunning = true;

  try {
    // Check if bot is running
    const botConfig = await BotConfig.findOne({ setting: "botStatus" });
    if (botConfig && botConfig.value !== "running") {
      console.log("Bot is not running. Skipping swap fetch.");
      isRunning = false;
      return;
    }

    console.log("Fetching new swaps...");

    // Get all active tracked wallets for copy trading
    const wallets = await TrackedWallet.find({ isActive: true, role: 'copy_trading' });

    if (wallets.length === 0) {
      console.log("No active wallets to track. Skipping swap fetch.");
      isRunning = false;
      return;
    }

    // Group wallets by chain for more efficient processing
    const walletsByChain = {};
    wallets.forEach((wallet) => {
      if (!walletsByChain[wallet.chain]) {
        walletsByChain[wallet.chain] = [];
      }
      walletsByChain[wallet.chain].push(wallet);
    });

    // Track total new swaps for summary
    let totalNewSwaps = 0;

    // Calculate time threshold (5 minutes ago)
    const timeThreshold = new Date(Date.now() - RECENT_SWAPS_WINDOW);

    // Fetch swaps for each chain
    for (const chainId in walletsByChain) {
      const chain = await Chain.findOne({ chainId });

      if (!chain || !chain.isActive) {
        console.log(`Chain ${chainId} is not active or not found. Skipping.`);
        continue;
      }

      // Process each wallet for this chain
      for (const wallet of walletsByChain[chainId]) {
        let newSwaps = [];

        // Fetch swaps based on chain type
        if (chain.type === "evm") {
          newSwaps = await getEvmSwaps(wallet.address, chain);
        } else if (chain.type === "solana") {
          newSwaps = await getSolanaSwaps(wallet.address);
        } else {
          console.log(`Unsupported chain type: ${chain.type}. Skipping.`);
          continue;
        }

        // Filter swaps by time threshold (only swaps in the last 5 minutes)
        newSwaps = newSwaps.filter(
          (swap) => new Date(swap.sourceTimestamp) >= timeThreshold
        );

        if (newSwaps.length === 0) continue;

        // Filter to only new swaps (not already in our database)
        const existingTxHashes = await Swap.find({
          sourceWallet: wallet.address,
          sourceChain: chainId,
        }).distinct("sourceTxHash");

        // Filter swaps by tracking start time
        const uniqueNewSwaps = newSwaps.filter((swap) => {
          // Only include swaps after wallet tracking started
          const swapTime = new Date(swap.sourceTimestamp);
          const trackingStartTime = wallet.createdAt || new Date(0);

          return (
            !existingTxHashes.includes(swap.sourceTxHash) &&
            swapTime >= trackingStartTime
          );
        });

        if (uniqueNewSwaps.length === 0) continue;

        console.log(
          `Found ${uniqueNewSwaps.length} new swaps for ${wallet.address} on ${chainId}`
        );
        totalNewSwaps += uniqueNewSwaps.length;

        // Insert new swaps into database
        // Use ordered: false to skip duplicates without failing the entire batch
        try {
          await Swap.insertMany(
            uniqueNewSwaps.map((swap) => ({
              ...swap,
              processed: false,
              status: { code: "pending" },
            })),
            { ordered: false }
          );
        } catch (insertError) {
          // If it's a duplicate key error, we can safely ignore it
          if (insertError.code !== 11000) {
            console.error("❌ Error inserting swaps:", insertError.message);
          }
        }

        // Update the last checked timestamp for this wallet
        wallet.lastChecked = new Date();
        await wallet.save();
      }
    }

    // Log summary only if new swaps were found
    if (totalNewSwaps > 0) {
      console.log(
        `Swap fetching completed. Added ${totalNewSwaps} new swaps to processing queue.`
      );
    }
  } catch (error) {
    console.error("Error fetching swaps:", error);
    // Send error notification to the bot owner
    try {
      await sendNotification(`❌ Error fetching swaps: ${error.message}`);
    } catch (e) {
      console.error("Error sending notification:", e);
    }
  } finally {
    isRunning = false;
  }
};

const startSwapFetcher = async () => {
  try {
    // Initial fetch
    await fetchNewSwaps();

    // Set up polling interval
    const pollFreq = parseInt(process.env.NEW_SWAP_POLLING_FREQ) || 60000; // Default: 1 minute
    pollingInterval = setInterval(fetchNewSwaps, pollFreq);

    console.log(`Swap fetcher started with polling frequency: ${pollFreq}ms`);
    return true;
  } catch (error) {
    console.error("Error starting swap fetcher:", error);
    return false;
  }
};

const stopSwapFetcher = () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    console.log("Swap fetcher stopped");
    return true;
  }
  return false;
};

module.exports = {
  startSwapFetcher,
  stopSwapFetcher,
  fetchNewSwaps, // Exported for testing or manual triggering
};
