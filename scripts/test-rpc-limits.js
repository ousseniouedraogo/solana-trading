require('dotenv').config();
const { getSolanaConnection } = require('../src/services/wallets/solana');

const testRateLimits = async () => {
    console.log('🚀 Starting Rate Limit Test...');
    const connection = getSolanaConnection();

    // We'll use a known account (SOL Mint) to query repeatedly
    const knownAccount = "So11111111111111111111111111111111111111112";
    const iterations = 50; // Enough to trigger default rate limits usually
    const results = [];

    console.log(`Sending ${iterations} concurrent requests...`);

    const startTime = Date.now();

    const promises = Array.from({ length: iterations }).map(async (_, index) => {
        try {
            // Small delay to prevent instant ban if they have strict WAF
            await new Promise(r => setTimeout(r, index * 20));

            const start = Date.now();
            await connection.getAccountInfo(new (require('@solana/web3.js').PublicKey)(knownAccount));
            const duration = Date.now() - start;

            results.push({ index, status: 'success', duration });
        } catch (error) {
            console.error(`❌ Request ${index} failed:`, error.message);
            results.push({ index, status: 'failed', error: error.message });
        }
    });

    await Promise.all(promises);

    const totalTime = Date.now() - startTime;
    const successes = results.filter(r => r.status === 'success');
    const failures = results.filter(r => r.status === 'failed');

    console.log('\n📊 Test Results:');
    console.log(`Total Requests: ${iterations}`);
    console.log(`Success: ${successes.length}`);
    console.log(`Failed: ${failures.length}`);
    console.log(`Total Time: ${totalTime}ms`);

    if (failures.length === 0) {
        console.log('✅ PASS: All requests handled successfully (wrapper is working)');
    } else {
        console.log('❌ FAIL: Some requests failed (wrapper might not be catching everything)');
    }

    process.exit(0);
};

testRateLimits();
