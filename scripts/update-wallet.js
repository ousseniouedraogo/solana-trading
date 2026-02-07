// Script to update wallet in database with the one from .env
require('dotenv').config();
const mongoose = require('mongoose');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const path = require('path');

const UserWallet = require(path.join(__dirname, '..', 'src', 'db', 'models', 'userWallets'));

async function updateWallet() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Get private key from env
        const privateKeyString = process.env.SOLANA_PRIVATE_KEY;
        if (!privateKeyString) {
            throw new Error('SOLANA_PRIVATE_KEY not found in .env');
        }

        // Decode and create keypair
        const privateKeyBytes = bs58.default.decode(privateKeyString);
        const keypair = Keypair.fromSecretKey(Buffer.from(privateKeyBytes));
        const publicKey = keypair.publicKey.toString();

        console.log('📍 New Wallet Address:', publicKey);

        // Get admin ID from env
        const adminId = process.env.TELEGRAM_ADMIN_ID || process.env.ADMIN_CHAT_ID;
        if (!adminId) {
            throw new Error('TELEGRAM_ADMIN_ID not found in .env');
        }

        // Find all existing wallets for admin
        const existingWallets = await UserWallet.find({ userId: adminId });

        if (existingWallets.length > 0) {
            console.log(`🔄 Found ${existingWallets.length} existing wallet(s). Deactivating...`);
            // Deactivate all existing wallets
            await UserWallet.updateMany(
                { userId: adminId },
                { $set: { isActive: false } }
            );
            console.log('✅ Old wallets deactivated');
        }

        // Create new wallet entry
        console.log('➕ Creating new wallet entry...');
        const wallet = new UserWallet({
            userId: adminId,
            publicKey: publicKey,
            privateKey: privateKeyString,
            walletName: 'System Imported Wallet',
            isActive: true
        });
        await wallet.save();
        console.log('✅ Wallet created successfully!');

        console.log('\n📊 Wallet Details:');
        console.log('   Address:', publicKey);
        console.log('   User ID:', adminId);
        console.log('   Status: Active');

        await mongoose.disconnect();
        console.log('\n✅ Database updated. Restart the bot to apply changes.');
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

updateWallet();
