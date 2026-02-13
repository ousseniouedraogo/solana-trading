const mongoose = require('mongoose');
require('dotenv').config();

async function checkAddress() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            family: 4
        });
        mongoose.set('bufferCommands', false);
        console.log('✅ Connected');

        const schema = new mongoose.Schema({}, { strict: false });
        const TrackedWallet = mongoose.model('TrackedWallet', schema, 'trackedwallets');

        const address = 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB';

        const wallet = await TrackedWallet.findOne({ address: { $regex: new RegExp(address, 'i') } }).exec();

        if (wallet) {
            console.log('FOUND WALLET:');
            console.log(JSON.stringify(wallet, null, 2));
        } else {
            console.log('WALLET NOT FOUND IN DATABASE (Case-insensitive check)');

            const all = await TrackedWallet.find({}).limit(10).exec();
            console.log(`First ${all.length} wallets in DB:`);
            all.forEach(w => console.log(`- ${w.address} (Active: ${w.isActive})`));
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkAddress();
