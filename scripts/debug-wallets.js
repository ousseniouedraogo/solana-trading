const mongoose = require('mongoose');
require('dotenv').config();
const TrackedWallet = require('../src/db/models/trackedWallets');

async function debugWallets() {
    try {
        console.log("🚀 Starting Wallet Debug...");
        console.log("URI:", process.env.MONGODB_URI);

        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected to MongoDB");

        const allWallets = await TrackedWallet.find({});
        console.log(`\n📊 Total Wallets: ${allWallets.length}`);

        if (allWallets.length === 0) {
            console.log("⚠️ No wallets found in DB.");
        } else {
            console.log("📋 Wallet Details:");
            allWallets.forEach(w => {
                console.log(`- ${w.address} (Chain: ${w.chain}, Role: ${w.role}, Active: ${w.isActive})`);
            });
        }

        const devWallets = await TrackedWallet.find({ role: 'dev_sniper' });
        console.log(`\n🕵️ Dev Sniper Wallets: ${devWallets.length}`);
        devWallets.forEach(w => {
            console.log(`- ${w.address} (Active: ${w.isActive})`);
        });

    } catch (error) {
        console.error("❌ Debug Error:", error);
    } finally {
        await mongoose.disconnect();
    }
}

debugWallets();
