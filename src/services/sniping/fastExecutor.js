// src/services/sniping/fastExecutor.js
const { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } = require("@solana/web3.js");
const { getSolanaConnection, getSolanaWallet } = require("../wallets/solana");
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require("@solana/spl-token");

/**
 * FastExecutor - Optimized sniping execution with pre-signed transactions
 * Target latency: 150-300ms from detection to execution
 */
class FastExecutor {
    constructor() {
        this.connection = null;
        this.wallet = null;
        this.preSignedTxPool = new Map(); // Cache of prepared transactions
        this.recentPriorityFees = [];
        this.maxCacheSize = 50;
    }

    async initialize() {
        this.connection = getSolanaConnection();
        this.wallet = getSolanaWallet();

        // Start monitoring priority fees
        this.startPriorityFeeMonitoring();

        console.log("⚡ FastExecutor initialized with optimized settings");
    }

    /**
     * Monitor recent priority fees to calculate optimal values
     */
    async startPriorityFeeMonitoring() {
        const updateFees = async () => {
            try {
                const fees = await this.connection.getRecentPrioritizationFees();
                if (fees && fees.length > 0) {
                    this.recentPriorityFees = fees.slice(0, 100); // Keep last 100 samples
                }
            } catch (error) {
                console.error("Error fetching priority fees:", error.message);
            }
        };

        // Update every 30 seconds
        setInterval(updateFees, 30000);
        await updateFees(); // Initial fetch
    }

    /**
     * Calculate optimal priority fee based on recent network activity
     * @returns {number} Priority fee in microlamports per compute unit
     */
    calculateOptimalPriorityFee() {
        if (this.recentPriorityFees.length === 0) {
            return 5000; // Default 0.000005 SOL per CU
        }

        // Sort fees and get 90th percentile
        const sorted = [...this.recentPriorityFees]
            .map(f => f.prioritizationFee)
            .filter(f => f > 0)
            .sort((a, b) => a - b);

        if (sorted.length === 0) return 5000;

        const p90Index = Math.floor(sorted.length * 0.9);
        const p90Fee = sorted[p90Index];

        // Add 20% buffer to ensure inclusion
        const optimalFee = Math.floor(p90Fee * 1.2);

        // Cap between 1000 (min) and 100000 (max) microlamports
        return Math.max(1000, Math.min(100000, optimalFee));
    }

    /**
     * Prepare a transaction in advance for instant execution
     * @param {string} tokenMint - Token mint address
     * @param {number} solAmount - Amount of SOL to spend
     */
    async prepareTransaction(tokenMint, solAmount = 0.01) {
        try {
            const tokenMintPubkey = new PublicKey(tokenMint);
            const walletPubkey = this.wallet.publicKey;

            // Get or create associated token account
            const ata = await getAssociatedTokenAddress(
                tokenMintPubkey,
                walletPubkey,
                false,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

            // Create transaction structure (will be filled with actual swap IX later)
            const tx = new Transaction();

            // Add compute budget instructions for priority
            const priorityFee = this.calculateOptimalPriorityFee();

            // Set compute unit price
            tx.add(
                new TransactionInstruction({
                    keys: [],
                    programId: new PublicKey("ComputeBudget111111111111111111111111111111"),
                    data: Buffer.from([
                        3, // SetComputeUnitPrice instruction
                        ...new Uint8Array(new BigInt64Array([BigInt(priorityFee)]).buffer)
                    ])
                })
            );

            // Set compute unit limit (300k is standard for swaps)
            tx.add(
                new TransactionInstruction({
                    keys: [],
                    programId: new PublicKey("ComputeBudget111111111111111111111111111111"),
                    data: Buffer.from([
                        2, // SetComputeUnitLimit instruction
                        ...new Uint8Array(new Uint32Array([300000]).buffer)
                    ])
                })
            );

            // Cache the prepared transaction framework
            this.preSignedTxPool.set(tokenMint, {
                transaction: tx,
                ata: ata.toString(),
                priorityFee,
                preparedAt: Date.now()
            });

            // Cleanup old cached transactions
            if (this.preSignedTxPool.size > this.maxCacheSize) {
                const oldestKey = Array.from(this.preSignedTxPool.keys())[0];
                this.preSignedTxPool.delete(oldestKey);
            }

            console.log(`⚡ Pre-prepared transaction for ${tokenMint.substring(0, 8)}... with priority fee: ${priorityFee}`);

            return true;
        } catch (error) {
            console.error(`Error preparing transaction for ${tokenMint}:`, error.message);
            return false;
        }
    }

    /**
     * Execute a buy transaction with minimal latency
     * @param {string} tokenMint - Token to buy
     * @param {number} solAmount - SOL amount to spend
     * @param {object} swapInstruction - Jupiter swap instruction
     * @returns {Promise<object>} Execution result
     */
    async executeFastBuy(tokenMint, solAmount, swapInstruction) {
        const startTime = Date.now();

        try {
            // Check if we have a pre-prepared transaction
            const cached = this.preSignedTxPool.get(tokenMint);
            let transaction;

            if (cached && (Date.now() - cached.preparedAt) < 60000) {
                // Use cached transaction (less than 1 minute old)
                transaction = cached.transaction;
                console.log(`⚡ Using pre-prepared transaction (cached ${Date.now() - cached.preparedAt}ms ago)`);
            } else {
                // Create fresh transaction
                transaction = new Transaction();
                const priorityFee = this.calculateOptimalPriorityFee();

                // Add compute budget
                transaction.add(
                    new TransactionInstruction({
                        keys: [],
                        programId: new PublicKey("ComputeBudget111111111111111111111111111111"),
                        data: Buffer.from([3, ...new Uint8Array(new BigInt64Array([BigInt(priorityFee)]).buffer)])
                    })
                );
                transaction.add(
                    new TransactionInstruction({
                        keys: [],
                        programId: new PublicKey("ComputeBudget111111111111111111111111111111"),
                        data: Buffer.from([2, ...new Uint8Array(new Uint32Array([300000]).buffer)])
                    })
                );
            }

            // Add the actual swap instruction
            if (swapInstruction) {
                transaction.add(swapInstruction);
            }

            // Get recent blockhash
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;

            // Sign transaction
            transaction.sign(this.wallet);

            const signTime = Date.now();
            console.log(`⏱️  Transaction prepared and signed in ${signTime - startTime}ms`);

            // Send with optimal settings
            const signature = await this.connection.sendRawTransaction(
                transaction.serialize(),
                {
                    skipPreflight: true, // Skip preflight for speed
                    maxRetries: 3
                }
            );

            const sendTime = Date.now();
            console.log(`🚀 Transaction sent in ${sendTime - signTime}ms (Total: ${sendTime - startTime}ms)`);

            // Confirm transaction
            const confirmation = await this.connection.confirmTransaction(
                {
                    signature,
                    blockhash,
                    lastValidBlockHeight
                },
                'confirmed'
            );

            const totalTime = Date.now() - startTime;

            if (confirmation.value.err) {
                console.error(`❌ Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
                return {
                    success: false,
                    error: "Transaction confirmation failed",
                    latency: totalTime
                };
            }

            console.log(`✅ Transaction confirmed in ${totalTime}ms total`);
            console.log(`🔗 https://solscan.io/tx/${signature}`);

            return {
                success: true,
                signature,
                latency: totalTime,
                explorerUrl: `https://solscan.io/tx/${signature}`
            };

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ Fast execution failed (${totalTime}ms):`, error.message);

            return {
                success: false,
                error: error.message,
                latency: totalTime
            };
        }
    }

    /**
     * Get performance statistics
     */
    getStats() {
        return {
            cachedTransactions: this.preSignedTxPool.size,
            currentPriorityFee: this.calculateOptimalPriorityFee(),
            recentFeeSamples: this.recentPriorityFees.length
        };
    }
}

module.exports = new FastExecutor();
