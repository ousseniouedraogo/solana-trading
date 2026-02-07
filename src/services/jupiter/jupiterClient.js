// src/services/jupiter/jupiterClient.js
const { createJupiterApiClient } = require('@jup-ag/api');

const ENDPOINT = 'https://api.jup.ag/swap/v1';
const CONFIG = {
    basePath: ENDPOINT
};

/**
 * Jupiter API Client instance
 */
const jupiterApi = createJupiterApiClient(CONFIG);

module.exports = {
    jupiterApi,
    ENDPOINT
};
