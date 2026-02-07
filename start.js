// Production startup file for cloud deployment
const path = require('path');

// Load environment variables
require('dotenv').config();

// Start the Solana bot
console.log('🌟 Starting Solana Trading Bot in production mode...');
console.log('Environment:', process.env.NODE_ENV || 'development');

// Import and start the bot
require('./solana-bot.js');