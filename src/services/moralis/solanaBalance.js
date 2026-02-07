// src/services/moralis/solanaBalance.js
const axios = require("axios");
require("dotenv").config();

/**
 * Get native SOL balance for a wallet address using Moralis Solana API
 * @param {string} walletAddress - The Solana wallet address
 * @returns {Promise<Object|null>} - The balance data or null on error
 */
const getSolanaNativeBalance = async (walletAddress) => {
    try {
        const apiKey = process.env.MORALIS_API_KEY;
        if (!apiKey) {
            throw new Error("MORALIS_API_KEY is not set in environment variables");
        }

        const url = `https://solana-gateway.moralis.io/account/mainnet/${walletAddress}/balance`;

        const response = await axios.get(url, {
            headers: {
                "Accept": "application/json",
                "X-API-Key": apiKey
            }
        });

        return response.data;
    } catch (error) {
        console.error(`❌ Error fetching Solana native balance for ${walletAddress}:`, error.response?.data || error.message);
        return null;
    }
};

module.exports = {
    getSolanaNativeBalance
};
