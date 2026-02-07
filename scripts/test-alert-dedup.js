// scripts/test-alert-dedup.js
require("dotenv").config();
const mongoose = require("mongoose");
const mintDetector = require("../src/services/sniping/mintDetector");
const AlertHistory = require("../src/db/models/alertHistory");

async function test() {
    try {
        console.log("Connectant à MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connecté");

        const testToken = "TEST_TOKEN_" + Date.now();
        const testWallet = { address: "TEST_WALLET_ADDR", name: "Test Wallet" };
        const testSig = "TEST_SIG";

        // Set environment variables if not present for the test
        process.env.TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID || "123456789";

        console.log(`\n--- Test 1: Premier appel pour ${testToken} ---`);
        await mintDetector.handleDetectedToken(testToken, testWallet, testSig, 'mint');

        const count1 = await AlertHistory.countDocuments({ tokenAddress: testToken });
        console.log(`Alertes en base après Test 1: ${count1}`);

        console.log(`\n--- Test 2: Second appel (doublon) pour ${testToken} ---`);
        await mintDetector.handleDetectedToken(testToken, testWallet, testSig, 'mint');

        const count2 = await AlertHistory.countDocuments({ tokenAddress: testToken });
        console.log(`Alertes en base après Test 2: ${count2}`);

        if (count2 === 1) {
            console.log("\n✅ SUCCÈS: Le doublon a été ignoré.");
        } else {
            console.log("\n❌ ÉCHEC: Le doublon n'a pas été ignoré.");
        }

        // Cleanup
        await AlertHistory.deleteMany({ tokenAddress: testToken });
        console.log("\nNettoyage terminé.");

    } catch (error) {
        console.error("❌ Erreur pendant le test:", error);
    } finally {
        await mongoose.disconnect();
    }
}

test();
