// src/services/sniping/onChainParser.js
const { PublicKey } = require("@solana/web3.js");

/**
 * OnChainParser - Decodes Solana transactions to extract token and pool information
 * without relying on external indexing APIs (Moralis, DexScreener).
 */
class OnChainParser {
    constructor() {
        this.RAYDIUM_AMM_PROGRAM_ID = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
        this.PUMP_FUN_PROGRAM_ID = new PublicKey("6EF8rrecthR5DkZJ4z6t18L9DXGf4C27YRTb261MCHy7");
        this.ORCA_WPOOL_PROGRAM_ID = new PublicKey("whirLbMi2YvthazScyuB38Ns3YiS9Ko21sMcBnAnFJi");
        this.TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
        this.WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
    }

    /**
     * Parse a transaction to detect Raydium pool initialization
     * @param {Object} tx - Parsed transaction object from connection.getParsedTransaction
     * @returns {Object|null} - Extracted pool info or null
     */
    parseRaydiumInit(tx) {
        if (!tx || !tx.meta) return null;

        const logs = tx.meta.logMessages || [];
        const isRaydiumInit = logs.some(log => log.includes("initialize2") || log.includes("InitializeInstruction2"));

        if (!isRaydiumInit) return null;

        // Extract token mints from postTokenBalances
        const postBalances = tx.meta.postTokenBalances || [];
        const tokens = postBalances.map(b => b.mint);

        // Find the non-SOL token
        const tokenMint = tokens.find(m => m !== this.WRAPPED_SOL_MINT) || null;

        if (!tokenMint) return null;

        // For Raydium, we can often find the pool address in accountKeys
        // In a pro sniper, you'd parse innerInstructions to be 100% sure
        const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey ? k.pubkey.toString() : k.toString());

        return {
            type: 'raydium_init',
            tokenMint,
            poolAddress: accountKeys[0], // Often the first account in init tx, but needs validation
            signature: tx.transaction.signatures[0]
        };
    }

    /**
     * Parse a transaction to detect Orca Whirlpool initialization
     * @param {Object} tx - Parsed transaction object
     * @returns {Object|null} - Extracted pool info or null
     */
    parseOrcaInit(tx) {
        if (!tx || !tx.meta) return null;

        const logs = tx.meta.logMessages || [];
        const isOrcaInit = logs.some(log => log.includes("initialize2") || log.includes("InitializePool"));

        if (!isOrcaInit) return null;

        const tokenMint = this.extractTokenAddress(tx);
        if (!tokenMint) return null;

        const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey ? k.pubkey.toString() : k.toString());

        return {
            type: 'orca_init',
            tokenMint,
            poolAddress: accountKeys[0],
            signature: tx.transaction.signatures[0]
        };
    }

    /**
     * Parse a transaction to detect Pump.fun token creation
     * @param {Object} tx - Parsed transaction object
     * @returns {Object|null} - Extracted token info or null
     */
    parsePumpFunCreate(tx) {
        if (!tx || !tx.meta) return null;

        const logs = tx.meta.logMessages || [];
        const isPumpCreate = logs.some(log => log.includes("Program log: Instruction: Create"));

        if (!isPumpCreate) return null;

        const postBalances = tx.meta.postTokenBalances || [];
        // Pump.fun creation logic: the new mint is usually visible in balances
        const tokenMint = postBalances.find(b => b.owner === this.PUMP_FUN_PROGRAM_ID.toString())?.mint ||
            postBalances.find(b => b.uiTokenAmount.uiAmount > 0)?.mint;

        return {
            type: 'pump_fun_create',
            tokenMint,
            signature: tx.transaction.signatures[0]
        };
    }

    /**
     * Generic token address extractor fallback
     */
    extractTokenAddress(tx) {
        const postTokenBalances = tx.meta?.postTokenBalances || [];
        const preTokenBalances = tx.meta?.preTokenBalances || [];

        const preMints = new Set(preTokenBalances.map(b => b.mint));
        for (const balance of postTokenBalances) {
            if (!preMints.has(balance.mint) && balance.mint !== this.WRAPPED_SOL_MINT) {
                return balance.mint;
            }
        }
        return null;
    }
}

module.exports = new OnChainParser();
