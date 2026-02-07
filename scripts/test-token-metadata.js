const { getTokenMetadata } = require('../src/services/moralis/tokenMetadata');
require('dotenv').config();

async function runTest() {
    console.log("🧪 Testing Token Metadata Retrieval...");

    // 1. Test with a known token (SOL)
    try {
        const solMint = "So11111111111111111111111111111111111111112";
        console.log(`\n1. Fetching metadata for SOL (${solMint})...`);
        const metadata = await getTokenMetadata(solMint);
        console.log("✅ Result:", metadata);
    } catch (e) {
        console.error("❌ SOL Test Failed:", e.message);
    }

    // 2. Test with a non-existent token (should return defaults, not throw)
    try {
        const nonExistentMint = "11111111111111111111111111111112"; // Valid but likely empty/404
        console.log(`\n2. Fetching metadata for a non-existent token (should not throw)...`);
        const metadata = await getTokenMetadata(nonExistentMint);
        console.log("✅ Result (Fallback expected):", metadata);

        if (metadata.symbol === "TOKEN" && metadata.decimals === 9) {
            console.log("✨ SUCCESS: Default values returned correctly.");
        } else {
            console.warn("⚠️ Received unexpected metadata values.");
        }
    } catch (e) {
        console.error("❌ Graceful Failure Test Failed (Error thrown):", e.message);
    }
}

runTest();
