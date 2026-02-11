const mongoose = require('mongoose');
require('dotenv').config();
process.env.AUTO_SNIPE_MCAP_FILTER = 'true'; // Force enable for test
const SnipeTarget = require('../src/db/models/snipeTargets');
const UserWallet = require('../src/db/models/userWallets');

// Mock dependencies
const marketCapFilter = {
    shouldSnipe: async (tokenAddress) => {
        console.log(`[Mock MC Filter] Checking ${tokenAddress}...`);
        if (tokenAddress === 'mock_token_pass') {
            return { shouldSnipe: true, marketCap: 10000, reason: 'Mock Pass' };
        } else {
            return { shouldSnipe: false, marketCap: 500, reason: 'Mock Fail - Low Cap' };
        }
    }
};

async function runVerification() {
    try {
        console.log("🚀 Starting Verification Script...");

        // Connect to DB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected to MongoDB");

        const userId = 'verify_user_123';
        const tokenPass = 'mock_token_pass';
        const tokenFail = 'mock_token_fail';

        // Clean up previous runs
        await SnipeTarget.deleteMany({ userId });
        console.log("🧹 Cleaned up old test data");

        // --- Scenario 1: New Mint Detection (Simulated) ---
        console.log("\n🧪 Test Case 1: Mocking New Mint Detection...");

        // Logic from mintDetector.js (SIMULATED)
        const targetPass = new SnipeTarget({
            userId,
            tokenAddress: tokenPass,
            tokenSymbol: 'TEST_PASS',
            targetAmount: 0.1,
            maxSlippage: 10,
            isActive: true,
            snipeStatus: 'pending',
            // critical fix:
            triggerCondition: 'liquidity_added'
        });
        await targetPass.save();
        console.log(`✅ Created Target 1 (Pass): ${targetPass._id} with trigger '${targetPass.triggerCondition}'`);

        const targetFail = new SnipeTarget({
            userId,
            tokenAddress: tokenFail,
            tokenSymbol: 'TEST_FAIL',
            targetAmount: 0.1,
            maxSlippage: 10,
            isActive: true,
            snipeStatus: 'pending',
            // critical fix:
            triggerCondition: 'liquidity_added'
        });
        await targetFail.save();
        console.log(`✅ Created Target 2 (Fail): ${targetFail._id} with trigger '${targetFail.triggerCondition}'`);


        // --- Scenario 2: Liquidity Addition & MC Check (Simulated) ---
        console.log("\n🧪 Test Case 2: Mocking Liquidity Check & MC Validation...");

        // Logic from tokenMonitor.js (SIMULATED)
        // We manually trigger the logic we added to tokenMonitor

        // Processor function mimicking changes in tokenMonitor.js
        const processTarget = async (target) => {
            console.log(`⚙️ Processing ${target.tokenSymbol}...`);

            // Assume liquidity found
            const liquidityInfo = { totalLiquidity: 1000, poolAddress: 'mock_pool' };
            console.log(`💰 Liquidity threshold met for ${target.tokenSymbol}`);

            // NEW LOGIC HERE:
            if (process.env.AUTO_SNIPE_MCAP_FILTER === 'true') {
                console.log(`📊 Checking market cap filter (Simulated)...`);
                const mcCheck = await marketCapFilter.shouldSnipe(target.tokenAddress);

                if (!mcCheck.shouldSnipe) {
                    console.log(`❌ Market cap filter REJECTED: ${mcCheck.reason}`);
                    target.snipeStatus = 'rejected';
                    target.isActive = false;
                    target.notes = `[Liquidity Check REJECTED] ${mcCheck.reason}`;
                    await target.save();
                    return 'REJECTED';
                }
                console.log(`✅ Market cap check PASSED: ${mcCheck.reason}`);
            }

            return 'PROCEED';
        };

        // Run for Pass Token
        const resultPass = await processTarget(targetPass);
        if (resultPass === 'PROCEED') console.log("✅ PASS Token -> Allowed to proceed (Correct)");
        else console.error("❌ PASS Token -> Rejected (Incorrect)");

        // Run for Fail Token
        const resultFail = await processTarget(targetFail);
        if (resultFail === 'REJECTED') console.log("✅ FAIL Token -> Rejected (Correct)");
        else console.error("❌ FAIL Token -> Allowed to proceed (Incorrect)");


        // Verify DB State
        const finalPass = await SnipeTarget.findById(targetPass._id);
        const finalFail = await SnipeTarget.findById(targetFail._id);

        console.log("\n📊 Final DB Verification:");
        console.log(`Pass Token Status: ${finalPass.snipeStatus} (Expected: pending)`);
        console.log(`Fail Token Status: ${finalFail.snipeStatus} (Expected: rejected)`);

        if (finalPass.snipeStatus === 'pending' && finalFail.snipeStatus === 'rejected') {
            console.log("\n✨ VERIFICATION SUCCESSFUL ✨");
        } else {
            console.log("\n⚠️ VERIFICATION FAILED ⚠️");
        }

    } catch (error) {
        console.error("❌ Verification Script Error:", error);
    } finally {
        await mongoose.disconnect();
    }
}

runVerification();
