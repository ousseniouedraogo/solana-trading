const mongoose = require('mongoose');
require('dotenv').config();

async function checkAddress() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const TrackedWallet = require('c:/Users/OUSSENI/Desktop/MES BOTS/telegram-copy-trading-bot-moralis-main/src/db/models/trackedWallets');
        const address = 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB';

        const wallet = await TrackedWallet.findOne({ address });
        if (wallet) {
            console.log('FOUND WALLET:');
            console.log(JSON.stringify(wallet, null, 2));
        } else {
            console.log('WALLET NOT FOUND IN DATABASE');

            // Check all wallets to see if there's something similar
            const allWallets = await TrackedWallet.find({});
            console.log(`Total wallets in DB: ${allWallets.length}`);
            allWallets.slice(0, 5).forEach(w => console.log(`- ${w.address} (${w.isActive ? 'Active' : 'Inactive'})`));
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkAddress();
