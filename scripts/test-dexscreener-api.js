// scripts/test-dexscreener-api.js
const axios = require("axios");

async function test(mintAddress) {
    try {
        console.log(`🔍 Testing DexScreener API for: ${mintAddress}`);
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`);

        if (response.data && response.data.pairs && response.data.pairs.length > 0) {
            const pair = response.data.pairs[0];
            console.log("✅ Success!");
            console.log(`Symbol: ${pair.baseToken.symbol}`);
            console.log(`Name: ${pair.baseToken.name}`);
            console.log(`Price USD: ${pair.priceUsd}`);
            console.log(`Liquidity USD: ${pair.liquidity?.usd}`);
        } else {
            console.log("⚠️ No pairs found on DexScreener (normal for very new tokens)");
        }
    } catch (error) {
        console.error(`❌ API Error: ${error.message}`);
    }
}

// Test with SOL and the token mentioned by the user
test("So11111111111111111111111111111111111111112");
test("9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump");
