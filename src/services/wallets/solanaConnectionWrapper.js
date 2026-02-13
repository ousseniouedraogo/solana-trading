const { Connection } = require("@solana/web3.js");

/**
 * reliable-connection.js
 * A wrapper around Solana Connection that handles 429 Rate Limit errors
 * with exponential backoff retry logic.
 */
class SolanaConnectionWrapper {
    constructor(endpoint, config) {
        this.connection = new Connection(endpoint, config);
        this.debug = false;
    }

    // Delegate all property reads to the underlying connection
    get(target, prop) {
        if (prop in this) {
            return this[prop];
        }
        // If the property is a function on the connection, wrap it
        if (typeof this.connection[prop] === 'function') {
            return (...args) => {
                return this.requestWithRetry(() => this.connection[prop](...args), prop);
            };
        }
        return this.connection[prop];
    }

    /**
     * Execute a function with retry logic for 429 errors
     * @param {Function} fn - The function to execute
     * @param {string} operationName - Name of the operation for logging
     * @param {number} maxRetries - Maximum number of retries
     * @param {number} baseDelay - Initial delay in ms
     */
    async requestWithRetry(fn, operationName, maxRetries = 5, baseDelay = 1000) {
        let retries = 0;

        while (true) {
            try {
                return await fn();
            } catch (error) {
                // Check for 429 or related rate limit errors
                const isRateLimit =
                    error.message?.includes('429') ||
                    error.message?.includes('Too Many Requests') ||
                    (error.response && error.response.status === 429);

                if (isRateLimit && retries < maxRetries) {
                    retries++;
                    // Exponential backoff with jitter: delay * 2^retries + random(0-500ms)
                    const delay = (baseDelay * Math.pow(2, retries - 1)) + Math.floor(Math.random() * 500);

                    if (this.debug || retries > 2) {
                        console.log(`⏳ Rate limited on ${operationName}. Retrying in ${delay}ms (Attempt ${retries}/${maxRetries})...`);
                    }

                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Check for network timeout or other transient errors that are safe to retry
                const isNetworkError =
                    error.message?.includes('network') ||
                    error.message?.includes('timeout') ||
                    error.message?.includes('socket hang up') ||
                    error.code === 'ECONNRESET' ||
                    error.code === 'ETIMEDOUT';

                if (isNetworkError && retries < maxRetries) {
                    retries++;
                    const delay = 1000;
                    console.log(`⚠️ Network error on ${operationName}: ${error.message}. Retrying... (${retries}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // If not retryable or max retries reached, throw the error
                if (retries >= maxRetries && (isRateLimit || isNetworkError)) {
                    console.error(`❌ Max retries reached for ${operationName} after ${retries} attempts.`);
                }

                throw error;
            }
        }
    }

    // Explicitly proxy common methods to ensure they are wrapped correctly
    // (The Proxy approach in getSolanaConnection below handles this, but 
    // defining them here documents the intent and supports non-Proxy usage if needed)
}

/**
 * Creates a proxied Connection object that intercepts all method calls
 * and applies retry logic.
 * @param {string} endpoint 
 * @param {object} config 
 * @returns {Connection}
 */
const createReliableConnection = (endpoint, config) => {
    const wrapper = new SolanaConnectionWrapper(endpoint, config);

    return new Proxy(wrapper.connection, {
        get: (target, prop, receiver) => {
            // If the wrapper has a specific implementation, use it
            if (prop in wrapper && typeof wrapper[prop] !== 'undefined') {
                return wrapper[prop];
            }

            const value = Reflect.get(target, prop, receiver);

            // If it's a function, wrap it with retry logic
            if (typeof value === 'function') {
                return async (...args) => {
                    return wrapper.requestWithRetry(() => value.apply(target, args), prop.toString());
                };
            }

            return value;
        }
    });
};

module.exports = { createReliableConnection, SolanaConnectionWrapper };
