// src/services/helius/tokenMetadata.js
const axios = require("axios");
require("dotenv").config();

/**
 * Get metadata for a Solana token using Helius Digital Asset Standard (DAS) API
 * @param {string} tokenMint - The token mint address
 * @returns {Promise<Object|null>} - The token metadata (symbol, name, decimals) or null if not found
 */
const getHeliusTokenMetadata = async (tokenMint) => {
    try {
        const apiKey = process.env.HELIUS_API_KEY;
        if (!apiKey) {
            console.warn("⚠️ HELIUS_API_KEY is not set in environment variables");
            return null;
        }

        const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;

        const response = await axios.post(url, {
            jsonrpc: "2.0",
            id: "get-token-metadata",
            method: "getAsset",
            params: {
                id: tokenMint,
                displayOptions: {
                    showFungible: true
                }
            }
        });

        const asset = response.data?.result;
        if (!asset) {
            return null;
        }

        // For SPL tokens, Helius returns token_info
        const tokenInfo = asset.token_info;
        const metadata = asset.content?.metadata;

        if (!tokenInfo && !metadata) {
            return null;
        }

        return {
            mint: tokenMint,
            symbol: tokenInfo?.symbol || metadata?.symbol || "UNKNOWN",
            name: metadata?.name || tokenInfo?.name || "Unknown Token",
            decimals: tokenInfo?.decimals || 9
        };
    } catch (error) {
        console.error(`❌ Helius error fetching metadata for ${tokenMint}:`, error.message);
        return null;
    }
};

module.exports = {
    getHeliusTokenMetadata
};
