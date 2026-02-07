// src/services/sniping/marketCapFilter.js
const axios = require("axios");

/**
 * Market Cap Filter - Only snipe tokens within target market cap range
 * Uses DexScreener API (free, no authentication required)
 */
class MarketCapFilter {
    constructor() {
        this.cache = new Map(); // Cache market cap data to reduce API calls
        this.cacheExpiry = 30000; // 30 seconds cache
        this.targetMin = parseFloat(process.env.AUTO_SNIPE_TARGET_MCAP_MIN) || 1000;
        this.targetMax = parseFloat(process.env.AUTO_SNIPE_TARGET_MCAP_MAX) || 50000;
    }

    /**
     * Get market cap for a token from DexScreener
     * @param {string} tokenMint - Token mint address
     * @returns {Promise<number|null>} Market cap in USD or null if not found
     */
    async getMarketCap(tokenMint) {
        try {
            // Check cache first
            const cached = this.cache.get(tokenMint);
            if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
                console.log(`📦 Using cached market cap for ${tokenMint.substring(0, 8)}...`);
                return cached.marketCap;
            }

            console.log(`🔍 Fetching market cap for ${tokenMint.substring(0, 8)}...`);

            const response = await axios.get(
                `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
                {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'SolanaSnipeBot/1.0'
                    }
                }
            );

            if (!response.data || !response.data.pairs || response.data.pairs.length === 0) {
                console.log(`⚠️  No pairs found for ${tokenMint.substring(0, 8)}...`);
                return null;
            }

            // Get the pair with highest liquidity (usually most reliable)
            const sortedPairs = response.data.pairs.sort((a, b) => {
                const liqA = parseFloat(a.liquidity?.usd || 0);
                const liqB = parseFloat(b.liquidity?.usd || 0);
                return liqB - liqA;
            });

            const bestPair = sortedPairs[0];
            let marketCap = parseFloat(bestPair.fdv || bestPair.marketCap || 0);

            // If market cap not directly available, estimate from liquidity
            if (marketCap === 0 && bestPair.liquidity?.usd) {
                // Rough estimation: MC ≈ Liquidity * 3-5 (typical for new tokens)
                marketCap = parseFloat(bestPair.liquidity.usd) * 4;
                console.log(`📊 Estimated market cap from liquidity: $${marketCap.toFixed(0)}`);
            }

            // Cache the result
            this.cache.set(tokenMint, {
                marketCap,
                timestamp: Date.now()
            });

            // Cleanup old cache entries
            if (this.cache.size > 100) {
                const oldestKey = Array.from(this.cache.keys())[0];
                this.cache.delete(oldestKey);
            }

            console.log(`💰 Market cap for ${tokenMint.substring(0, 8)}...: $${marketCap.toFixed(0)}`);
            return marketCap;

        } catch (error) {
            console.error(`❌ Error fetching market cap for ${tokenMint}:`, error.message);
            return null;
        }
    }

    /**
     * Check if token should be sniped based on market cap
     * @param {string} tokenMint - Token mint address
     * @param {number} customMin - Optional custom minimum (overrides env)
     * @param {number} customMax - Optional custom maximum (overrides env)
     * @returns {Promise<object>} { shouldSnipe: boolean, marketCap: number, reason: string }
     */
    async shouldSnipe(tokenMint, customMin = null, customMax = null) {
        const minMC = customMin || this.targetMin;
        const maxMC = customMax || this.targetMax;

        try {
            const marketCap = await this.getMarketCap(tokenMint);

            if (marketCap === null) {
                return {
                    shouldSnipe: false,
                    marketCap: 0,
                    reason: "Market cap data not available yet"
                };
            }

            if (marketCap < minMC) {
                return {
                    shouldSnipe: false,
                    marketCap,
                    reason: `Market cap too low ($${marketCap.toFixed(0)} < $${minMC})`
                };
            }

            if (marketCap > maxMC) {
                return {
                    shouldSnipe: false,
                    marketCap,
                    reason: `Market cap too high ($${marketCap.toFixed(0)} > $${maxMC})`
                };
            }

            return {
                shouldSnipe: true,
                marketCap,
                reason: `Market cap in target range ($${marketCap.toFixed(0)})`
            };

        } catch (error) {
            console.error(`❌ Error in shouldSnipe check:`, error.message);
            return {
                shouldSnipe: false,
                marketCap: 0,
                reason: `Error: ${error.message}`
            };
        }
    }

    /**
     * Get detailed token info including market cap, liquidity, volume
     * @param {string} tokenMint - Token mint address
     * @returns {Promise<object|null>} Detailed token info or null
     */
    async getTokenInfo(tokenMint) {
        try {
            const response = await axios.get(
                `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
                {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'SolanaSnipeBot/1.0'
                    }
                }
            );

            if (!response.data || !response.data.pairs || response.data.pairs.length === 0) {
                return null;
            }

            const bestPair = response.data.pairs.sort((a, b) => {
                const liqA = parseFloat(a.liquidity?.usd || 0);
                const liqB = parseFloat(b.liquidity?.usd || 0);
                return liqB - liqA;
            })[0];

            return {
                symbol: bestPair.baseToken?.symbol || 'UNKNOWN',
                name: bestPair.baseToken?.name || '',
                marketCap: parseFloat(bestPair.fdv || bestPair.marketCap || 0),
                liquidity: parseFloat(bestPair.liquidity?.usd || 0),
                volume24h: parseFloat(bestPair.volume?.h24 || 0),
                priceUsd: parseFloat(bestPair.priceUsd || 0),
                priceChange24h: parseFloat(bestPair.priceChange?.h24 || 0),
                pairAddress: bestPair.pairAddress,
                dexId: bestPair.dexId,
                url: bestPair.url
            };

        } catch (error) {
            console.error(`❌ Error fetching token info:`, error.message);
            return null;
        }
    }

    /**
     * Update target market cap range
     * @param {number} min - Minimum market cap
     * @param {number} max - Maximum market cap
     */
    setTargetRange(min, max) {
        this.targetMin = min;
        this.targetMax = max;
        console.log(`📊 Market cap filter range updated: $${min} - $${max}`);
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return {
            targetMin: this.targetMin,
            targetMax: this.targetMax,
            cacheSize: this.cache.size,
            cacheExpiry: this.cacheExpiry
        };
    }
}

module.exports = new MarketCapFilter();
