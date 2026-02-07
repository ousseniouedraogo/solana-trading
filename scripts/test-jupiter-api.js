// scripts/test-jupiter-api.js
const { createJupiterApiClient } = require('@jup-ag/api');

async function testJupiter() {
    console.log('🧪 Testing Jupiter API Client Initialization...');

    const ENDPOINT = 'https://api.jup.ag/swap/v1';
    const CONFIG = {
        basePath: ENDPOINT
    };

    try {
        const jupiterApi = createJupiterApiClient(CONFIG);
        console.log('✅ Jupiter API Client initialized successfully!');

        // Try a simple operation (e.g., getting a quote for SOL to USDC)
        console.log('🔍 Fetching test quote: SOL -> USDC...');
        const quote = await jupiterApi.quoteGet({
            inputMint: 'So11111111111111111111111111111111111111112', // SOL
            outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
            amount: 100000000, // 0.1 SOL
            slippageBps: 50,
        });

        if (quote) {
            console.log('✅ Quote received successfully!');
            console.log(`In: ${quote.inAmount} Lamports`);
            console.log(`Out: ${quote.outAmount} USDC (6 decimals)`);
        }
    } catch (error) {
        console.error('❌ Error testing Jupiter API:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

testJupiter();
