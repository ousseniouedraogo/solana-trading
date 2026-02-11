const mongoose = require('mongoose');
require('dotenv').config();
const TrackedWallet = require('../src/db/models/trackedWallets');

async function clearWallets() {
    try {
        console.log("🚀 Starting Wallet Cleanup...");
        console.log("URI:", process.env.MONGODB_URI);

        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected to MongoDB");

        const result = await TrackedWallet.deleteMany({});
        console.log(`\n🗑️ Deleted ${result.deletedCount} wallets.`);

    } catch (error) {
        console.error("❌ Cleanup Error:", error);
    } finally {
        await mongoose.disconnect();
    }
}

clearWallets();
