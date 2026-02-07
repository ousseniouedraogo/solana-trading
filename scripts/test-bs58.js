const bs58 = require('bs58');
const { Keypair } = require('@solana/web3.js');

function test(key) {
    console.log(`Testing key: "${key}"`);
    try {
        console.log('Using bs58.decode...');
        const decoded = bs58.decode(key);
        console.log('Decoded length:', decoded.length);
        const keypair = Keypair.fromSecretKey(decoded);
        console.log('Public key:', keypair.publicKey.toString());
    } catch (e) {
        console.log('bs58.decode failed:', e.message);

        try {
            console.log('Trying bs58.default.decode...');
            const decoded = bs58.default.decode(key);
            console.log('Decoded length:', decoded.length);
            const keypair = Keypair.fromSecretKey(decoded);
            console.log('Public key:', keypair.publicKey.toString());
        } catch (e2) {
            console.log('bs58.default.decode failed:', e2.message);
        }
    }
}

// A valid Solana private key (randomly generated for testing)
const testKey = '5M9H9yG5N5YxG8L1Jm6H7x9p8v7r6q5S9H9yG5N5YxG8L1Jm6H7x9p8v7r6q5S9H9yG5N5YxG8L1Jm6H7x9p8';
// test(testKey); 
// Note: The above is just a dummy key for structure, I'll run one with a real valid-looking length if needed.

console.log('Checking bs58 export structure:', Object.keys(bs58));
if (bs58.default) console.log('bs58.default keys:', Object.keys(bs58.default));
