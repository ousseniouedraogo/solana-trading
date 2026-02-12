// src/services/sniping/proScanner.js
const { PublicKey } = require("@solana/web3.js");
const { getSolanaConnection } = require("../wallets/solana");
const onChainParser = require("./onChainParser");
const mintDetector = require("./mintDetector"); // Reusing its handling logic for now

/**
 * ProScanner - Orchestrates real-time Solana blockchain monitoring via WebSockets.
 */
class ProScanner {
    constructor() {
        this.connection = null;
        this.isRunning = false;
        this.subscriptions = new Map();
        this.processedTx = new Set();
    }

    async initialize() {
        try {
            this.connection = getSolanaConnection();
            this.isRunning = true;

            console.log("📡 Initializing Pro Scanner (WebSocket Real-Time)...");

            // 1. Subscribe to Raydium AMM
            this.subscribeToProgram(onChainParser.RAYDIUM_AMM_PROGRAM_ID, (logs) => this.handleRaydiumLogs(logs));

            // 2. Subscribe to Pump.fun
            this.subscribeToProgram(onChainParser.PUMP_FUN_PROGRAM_ID, (logs) => this.handlePumpFunLogs(logs));

            // 3. Subscribe to Orca
            this.subscribeToProgram(onChainParser.ORCA_WPOOL_PROGRAM_ID, (logs) => this.handleOrcaLogs(logs));

            console.log("🚀 Pro Scanner active and monitoring Raydium, Pump.fun & Orca");
        } catch (error) {
            console.error("❌ Failed to initialize Pro Scanner:", error);
        }
    }

    subscribeToProgram(programId, callback) {
        try {
            const subId = this.connection.onLogs(programId, callback, 'confirmed');
            this.subscriptions.set(programId.toString(), subId);
            console.log(`📡 Subscribed to logs for program: ${programId.toString()}`);
        } catch (e) {
            console.error(`❌ Error subscribing to ${programId}:`, e.message);
        }
    }

    async handleRaydiumLogs(logs) {
        if (this.processedTx.has(logs.signature)) return;

        // Quick filter for initialize events
        if (logs.logs.some(l => l.includes("initialize2") || l.includes("InitializeInstruction2"))) {
            this.processedTx.add(logs.signature);
            console.log(`🆕 Raydium activity detected: ${logs.signature}`);

            const tx = await this.connection.getParsedTransaction(logs.signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });

            const poolInfo = onChainParser.parseRaydiumInit(tx);
            if (poolInfo) {
                console.log(`🎯 Raydium Pool Init! Token: ${poolInfo.tokenMint}`);
                // Forward to mintDetector's robust handling logic
                await mintDetector.handleDetectedToken(poolInfo.tokenMint, { address: 'Raydium_AMM' }, logs.signature, 'liquidity_init');
            }
        }
    }

    async handlePumpFunLogs(logs) {
        if (this.processedTx.has(logs.signature)) return;

        if (logs.logs.some(l => l.includes("Instruction: Create"))) {
            this.processedTx.add(logs.signature);
            console.log(`🆕 Pump.fun activity detected: ${logs.signature}`);

            const tx = await this.connection.getParsedTransaction(logs.signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });

            const tokenInfo = onChainParser.parsePumpFunCreate(tx);
            if (tokenInfo) {
                console.log(`🎯 Pump.fun Launch! Token: ${tokenInfo.tokenMint}`);
                await mintDetector.handleDetectedToken(tokenInfo.tokenMint, { address: 'Pump_Fun' }, logs.signature, 'mint');
            }
        }
    }

    async handleOrcaLogs(logs) {
        if (this.processedTx.has(logs.signature)) return;

        if (logs.logs.some(l => l.includes("InitializePool"))) {
            this.processedTx.add(logs.signature);
            console.log(`🆕 Orca activity detected: ${logs.signature}`);

            const tx = await this.connection.getParsedTransaction(logs.signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });

            const poolInfo = onChainParser.parseOrcaInit(tx);
            if (poolInfo) {
                console.log(`🎯 Orca Pool Init! Token: ${poolInfo.tokenMint}`);
                await mintDetector.handleDetectedToken(poolInfo.tokenMint, { address: 'Orca_AMM' }, logs.signature, 'liquidity_init');
            }
        }
    }

    // Periodic cache cleanup
    cleanup() {
        if (this.processedTx.size > 2000) {
            const arr = Array.from(this.processedTx);
            this.processedTx = new Set(arr.slice(-1000));
        }
    }

    stop() {
        this.isRunning = false;
        for (const [id, subId] of this.subscriptions) {
            this.connection.removeOnLogsListener(subId);
        }
        this.subscriptions.clear();
    }
}

module.exports = new ProScanner();
