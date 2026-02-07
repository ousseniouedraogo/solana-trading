// scripts/test-moralis-solana.js
require("dotenv").config();
const { getSolanaSwaps } = require("../src/services/moralis/solanaSwaps");
const { getSolanaNativeBalance } = require("../src/services/moralis/solanaBalance");

const TEST_WALLET = "kXB7FfzdrfZpAZEW3TZcp8a8CwQbsowa6BdfAHZ4gVs"; // Wallet from user example

async function test() {
    console.log(`🧪 Testing Moralis Solana Integration for wallet: ${TEST_WALLET}`);

    // Test native balance
    console.log("\n💰 Fetching Native Balance...");
    const balance = await getSolanaNativeBalance(TEST_WALLET);
    if (balance) {
        console.log("✅ Balance Fetch Success!");
        console.log(`SOL: ${balance.solana}`);
        console.log(`Lamports: ${balance.lamports}`);
    } else {
        console.log("❌ Balance Fetch Failed!");
    }

    // Test swaps
    console.log("\n🔄 Fetching Swaps (with transactionTypes: buy,sell)...");
    const swaps = await getSolanaSwaps(TEST_WALLET, 5);
    if (swaps && swaps.length > 0) {
        console.log(`✅ Swaps Fetch Success! Found ${swaps.length} recent swaps.`);
        swaps.forEach((swap, i) => {
            console.log(`[${i + 1}] ${swap.sourceTimestamp} | ${swap.tokenIn.symbol} -> ${swap.tokenOut.symbol} | TX: ${swap.sourceTxHash.substring(0, 8)}...`);
        });
    } else {
        console.log("❌ Swaps Fetch Failed or No Swaps Found!");
    }
}

test().catch(console.error);
