// scripts/test-fast-executor.js
const fastExecutor = require("../src/services/sniping/fastExecutor");
require("dotenv").config();

/**
 * Benchmark script for FastExecutor performance
 * Tests latency and priority fee calculation
 */
async function runBenchmark() {
    console.log("⚡ Starting FastExecutor Benchmark...\n");

    try {
        // Initialize
        await fastExecutor.initialize();
        console.log("✅ FastExecutor initialized\n");

        // Test 1: Priority Fee Calculation
        console.log("📊 Test 1: Priority Fee Calculation");
        const fee = fastExecutor.calculateOptimalPriorityFee();
        console.log(`   Current optimal fee: ${fee} microlamports`);
        console.log(`   Equivalent: ${(fee / 1000000).toFixed(6)} SOL per compute unit\n`);

        // Test 2: Transaction Preparation
        console.log("🔧 Test 2: Transaction Preparation Speed");
        const testTokenMint = "So11111111111111111111111111111111111111112"; // SOL for testing

        const prepStart = Date.now();
        await fastExecutor.prepareTransaction(testTokenMint, 0.01);
        const prepTime = Date.now() - prepStart;

        console.log(`   ✅ Preparation time: ${prepTime}ms`);

        if (prepTime < 100) {
            console.log(`   🎉 Excellent! (Target: <100ms)\n`);
        } else if (prepTime < 200) {
            console.log(`   👍 Good (Target: <100ms)\n`);
        } else {
            console.log(`   ⚠️  Slow - check RPC connection\n`);
        }

        // Test 3: Multi-preparation (cache test)
        console.log("🚀 Test 3: Cached Transaction Performance");
        const tokens = [
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
            "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
        ];

        const cacheStart = Date.now();
        for (const token of tokens) {
            await fastExecutor.prepareTransaction(token, 0.01);
        }
        const cacheTime = Date.now() - cacheStart;
        const avgCacheTime = cacheTime / tokens.length;

        console.log(`   Prepared ${tokens.length} transactions in ${cacheTime}ms`);
        console.log(`   Average: ${avgCacheTime.toFixed(0)}ms per transaction\n`);

        // Test 4: Stats
        console.log("📈 Test 4: FastExecutor Stats");
        const stats = fastExecutor.getStats();
        console.log(`   Cached transactions: ${stats.cachedTransactions}`);
        console.log(`   Current priority fee: ${stats.currentPriorityFee} microlamports`);
        console.log(`   Recent fee samples: ${stats.recentFeeSamples}\n`);

        // Test 5: RPC Check
        console.log("🌐 Test 5: RPC Configuration");
        const rpcUrl = process.env.SOLANA_RPC_URL || "Not configured";
        const wssUrl = process.env.SOLANA_WSS_URL || "Not configured";

        console.log(`   HTTP RPC: ${maskApiKey(rpcUrl)}`);
        console.log(`   WSS RPC: ${maskApiKey(wssUrl)}`);

        if (rpcUrl.includes("helius") || rpcUrl.includes("quicknode") || rpcUrl.includes("triton")) {
            console.log(`   ✅ Premium RPC detected - optimal for sniping\n`);
        } else if (rpcUrl.includes("mainnet-beta.solana.com")) {
            console.log(`   ⚠️  Using public RPC - upgrade recommended for competitive sniping\n`);
        } else {
            console.log(`   ℹ️  Custom RPC configured\n`);
        }

        // Final Assessment
        console.log("=".repeat(60));
        console.log("📋 BENCHMARK SUMMARY\n");

        let score = 0;
        let feedback = [];

        // Score preparation speed
        if (prepTime < 100) {
            score += 25;
            feedback.push("✅ Fast transaction preparation");
        } else if (prepTime < 200) {
            score += 15;
            feedback.push("⚠️  Moderate transaction preparation");
        } else {
            score += 5;
            feedback.push("❌ Slow transaction preparation");
        }

        // Score RPC
        if (rpcUrl.includes("helius") || rpcUrl.includes("quicknode") || rpcUrl.includes("triton")) {
            score += 50;
            feedback.push("✅ Premium RPC configured");
        } else {
            score += 10;
            feedback.push("⚠️  Non-premium RPC (upgrade recommended)");
        }

        // Score priority fees
        if (stats.recentFeeSamples > 10) {
            score += 25;
            feedback.push("✅ Good priority fee monitoring");
        } else if (stats.recentFeeSamples > 0) {
            score += 15;
            feedback.push("⚠️  Limited priority fee data");
        } else {
            score += 5;
            feedback.push("❌ No priority fee data");
        }

        console.log(`SCORE: ${score}/100\n`);
        feedback.forEach(f => console.log(f));

        console.log("\n" + "=".repeat(60));

        if (score >= 80) {
            console.log("\n🎉 EXCELLENT SETUP! You're ready for competitive sniping.");
            console.log("   Expected latency: 150-300ms (Top 5% of bots)");
        } else if (score >= 60) {
            console.log("\n👍 GOOD SETUP. Some optimizations recommended:");
            if (!rpcUrl.includes("helius") && !rpcUrl.includes("quicknode") && !rpcUrl.includes("triton")) {
                console.log("   • Upgrade to premium RPC (Helius/QuickNode)");
            }
            console.log("   Expected latency: 300-600ms");
        } else {
            console.log("\n⚠️  NEEDS IMPROVEMENT:");
            console.log("   • Upgrade to premium RPC (mandatory for competitive sniping)");
            console.log("   • Improve network connection");
            console.log("   Expected latency: >1000ms (not competitive)");
        }

        console.log("\n📚 See docs/RPC_SETUP.md for detailed setup instructions\n");

    } catch (error) {
        console.error("\n❌ Benchmark failed:", error.message);
        console.error("\nTroubleshooting:");
        console.error("1. Check your .env file has SOLANA_RPC_URL configured");
        console.error("2. Ensure RPC endpoint is accessible");
        console.error("3. Verify SOLANA_PRIVATE_KEY is valid\n");
    }
}

function maskApiKey(url) {
    if (!url || url === "Not configured") return url;
    // Mask API keys in URLs
    return url.replace(/api-key=[^&\s]+/gi, "api-key=***")
        .replace(/[a-f0-9]{32,}/gi, "***");
}

// Run benchmark
runBenchmark().catch(console.error);
