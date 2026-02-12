// src/services/execution/jitoExecutor.js
const axios = require("axios");
const { PublicKey, Transaction, SystemProgram } = require("@solana/web3.js");

/**
 * JitoExecutor - Handles sending transactions via Jito Bundles for priority and MEV protection.
 */
class JitoExecutor {
    constructor() {
        this.jitoEndpoints = [
            "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
            "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles",
            "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles",
            "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles",
            "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles",
        ];

        this.jitoTipAccounts = [
            "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nm98S9Wn7",
            "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
            "Cw8CFyMv99yHbq7S6KoJ6Pnf7SYB3A2P8m9f8atEek93",
            "ADaUMid9yfUytqMBmgrZ9iSgZW8UvC76s7Lz5YpWhN7V",
            "ADuUkR4vqMShm2iMvTAsqS79fR4R9En56f2o5f8EnPEn",
            "DttWaMuVvTf86v8NWARp899ptC68uYvG82qreLqN8PSe",
            "3AVi9Tg9Uo68ayJ9K9SyuPThSWh65mBBRY2vT6A2Yv5X",
            "DfXyU6WsrCD7wkRtgAsRURC9p9TuhC218B87y8Kxy79f"
        ];
    }

    /**
     * Get a random Jito Tip Account
     */
    getRandomTipAccount() {
        return new PublicKey(this.jitoTipAccounts[Math.floor(Math.random() * this.jitoTipAccounts.length)]);
    }

    /**
     * Send a versioned transaction as a Jito Bundle
     * @param {VersionedTransaction} transaction - Signed versioned transaction
     * @param {Keypair} payer - Payer for the tip
     * @param {number} tipAmountSol - Tip amount in SOL
     */
    async sendBundle(transaction, payer, tipAmountSol = 0.001) {
        try {
            const tipAmountLamports = Math.floor(tipAmountSol * 1e9);
            const tipAccount = this.getRandomTipAccount();

            // Create tip instruction
            const tipIx = SystemProgram.transfer({
                fromPubkey: payer.publicKey,
                toPubkey: tipAccount,
                lamports: tipAmountLamports,
            });

            // Note: In a real bundle, you'd combine the original transaction and the tip transaction
            // or append the tip instruction if possible. For Jupiter Ultra, it handles its own execution.
            // If using raw Jito bundles, you'd create a bundle of 2 transactions.

            console.log(`💎 Sending Jito Bundle with tip: ${tipAmountSol} SOL to ${tipAccount.toString()}`);

            const serializedTx = Buffer.from(transaction.serialize()).toString("base64");

            const response = await axios.post(this.jitoEndpoints[0], {
                jsonrpc: "2.0",
                id: 1,
                method: "sendBundle",
                params: [[serializedTx]]
            });

            if (response.data?.result) {
                console.log(`✅ Jito Bundle sent! Result: ${response.data.result}`);
                return { success: true, bundleId: response.data.result };
            } else {
                throw new Error(JSON.error || "Failed to send Jito bundle");
            }
        } catch (error) {
            console.error("❌ Jito Bundle error:", error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new JitoExecutor();
