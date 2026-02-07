// src/services/moralis/tokenMetadata.js
const axios = require("axios");
require("dotenv").config();

/**
 * Get metadata for a Solana token using Moralis Solana API
 * @param {string} tokenMint - The token mint address
 * @returns {Promise<Object>} - The token metadata (symbol, name, decimals)
 */
const getTokenMetadata = async (tokenMint) => {
    try {
        const apiKey = process.env.MORALIS_API_KEY;
        if (!apiKey) {
            throw new Error("MORALIS_API_KEY is not set in environment variables");
        }

        // Handle native SOL
        if (tokenMint === "So11111111111111111111111111111111111111112" ||
            tokenMint === "11111111111111111111111111111111") {
            return {
                mint: "So11111111111111111111111111111111111111112",
                symbol: "SOL",
                name: "Wrapped SOL",
                decimals: 9
            };
        }

        const url = `https://solana-gateway.moralis.io/token/mainnet/${tokenMint}/metadata`;

        const response = await axios.get(url, {
            headers: {
                "Accept": "application/json",
                "X-API-Key": apiKey
            }
        });

        if (!response.data) {
            throw new Error("No metadata found for this token");
        }

        return {
            mint: tokenMint,
            symbol: response.data.symbol || "UNKNOWN",
            name: response.data.name || "Unknown Token",
            decimals: response.data.decimals || 9
        };
    } catch (error) {
        console.error(`❌ Error fetching metadata for ${tokenMint}:`, error.response?.data || error.message);

        // Fallback or rethrow
        if (error.response?.status === 404) {
            console.warn(`⚠️ Token ${tokenMint} not yet indexed by Moralis. Using default values.`);
        }

        // Default values for unknown tokens
        return {
            mint: tokenMint,
            symbol: "TOKEN",
            name: "Unknown Token",
            decimals: 9
        };
    }
};

module.exports = {
    getTokenMetadata
};
