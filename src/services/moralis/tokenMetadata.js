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
        const moralisApiKey = process.env.MORALIS_API_KEY;

        // Handle native SOL
        const nativeSolAddresses = [
            "So11111111111111111111111111111111111111112",
            "11111111111111111111111111111111",
            "SOL"
        ];

        if (nativeSolAddresses.includes(tokenMint)) {
            return {
                mint: "So11111111111111111111111111111111111111112",
                symbol: "SOL",
                name: "Wrapped SOL",
                decimals: 9
            };
        }

        // 1. Try Helius first (Fastest indexing for new tokens)
        try {
            const { getHeliusTokenMetadata } = require("../helius/tokenMetadata");
            const heliusData = await getHeliusTokenMetadata(tokenMint);
            if (heliusData && heliusData.symbol !== "UNKNOWN") {
                console.log(`✅ Fetched metadata for ${tokenMint} via Helius: ${heliusData.symbol}`);
                return heliusData;
            }
        } catch (heliusError) {
            console.warn(`⚠️ Helius metadata fetch failed for ${tokenMint}:`, heliusError.message);
        }

        // 2. Fallback to Moralis
        if (moralisApiKey) {
            try {
                const url = `https://solana-gateway.moralis.io/token/mainnet/${tokenMint}/metadata`;
                const response = await axios.get(url, {
                    headers: {
                        "Accept": "application/json",
                        "X-API-Key": moralisApiKey
                    },
                    timeout: 2000
                });

                if (response.data) {
                    console.log(`✅ Fetched metadata for ${tokenMint} via Moralis: ${response.data.symbol}`);
                    return {
                        mint: tokenMint,
                        symbol: response.data.symbol || "UNKNOWN",
                        name: response.data.name || "Unknown Token",
                        decimals: response.data.decimals || 9
                    };
                }
            } catch (moralisError) {
                if (moralisError.response?.status === 404) {
                    console.warn(`⚠️ Token ${tokenMint} not yet indexed by Moralis.`);
                } else {
                    console.error(`❌ Moralis error for ${tokenMint}:`, moralisError.message);
                }
            }
        }

        // 3. Last Resort: Default values
        console.warn(`⚠️ Using default metadata for ${tokenMint}`);
        return {
            mint: tokenMint,
            symbol: "TOKEN",
            name: "Unknown Token",
            decimals: 9
        };
    } catch (error) {
        console.error(`❌ Unexpected error fetching metadata for ${tokenMint}:`, error.message);
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
