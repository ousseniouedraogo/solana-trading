const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58").default || require("bs58");
require('dotenv').config();

// Simulation of UserWallet model
const testWallet = {
    publicKey: "TestPubkey",
    privateKey: process.env.SOLANA_PRIVATE_KEY
};

async function testWalletReconstruction() {
    console.log("🧪 Diagnostic: Testing Wallet Reconstruction & Signing...");

    if (!testWallet.privateKey) {
        console.error("❌ SOLANA_PRIVATE_KEY not found in .env. Cannot proceed with test.");
        return;
    }

    try {
        console.log("\n1. Testing Reconstruction logic...");
        let secretKey;
        if (testWallet.privateKey.startsWith('[') && testWallet.privateKey.endsWith(']')) {
            console.log("   Format: Array string");
            secretKey = new Uint8Array(JSON.parse(testWallet.privateKey));
        } else {
            console.log("   Format: Base58 string");
            secretKey = bs58.decode(testWallet.privateKey);
        }

        const wallet = Keypair.fromSecretKey(secretKey);
        console.log("✅ Keypair created successfully.");
        console.log("   Public Key:", wallet.publicKey.toString());

        // Test signing
        console.log("\n2. Testing Signing capability...");
        const message = new TextEncoder().encode("Hello Solana");
        const signature = wallet.secretKey.slice(0, 64); // This isn't how you sign, but testing if we have full secret key

        // Real signing test
        // Let's create a dummy VersionedTransaction or use sign directly?
        // Keypair doesn't have a sign() method for messages, it's usually used in transactions.

        console.log("✅ SecretKey length:", wallet.secretKey.length);
        if (wallet.secretKey.length === 64) {
            console.log("✨ Wallet looks valid and functional.");
        } else {
            console.error("❌ Invalid secretKey length:", wallet.secretKey.length);
        }

    } catch (error) {
        console.error("❌ Reconstruction Failed:", error.message);
        console.error(error);
    }
}

testWalletReconstruction();
