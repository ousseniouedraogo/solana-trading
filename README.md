# 🤖 Telegram Copy Trading Bot

An automated bot that tracks and copies trading activities from specified wallets across multiple blockchains, directly to your Telegram.

## Overview

This Telegram bot allows you to track specified wallets across different blockchains (Ethereum, Base, Polygon, Solana) and automatically copy their swap transactions. When a tracked wallet makes a swap, the bot executes the same trade for you and sends you a notification.

### Key Features

- 🌐 **Multi-Chain Support**: Track wallets on Ethereum, Base, Polygon, and Solana
- 👛 **Wallet Tracking**: Add any wallet address you want to track via Telegram commands
- 💱 **Automatic Trade Copying**: Automatically executes the same trades as tracked wallets
- 📊 **Balance Checking**: View your wallet balances across different chains
- 📱 **Telegram Interface**: Easy-to-use command interface through Telegram
- 🔔 **Real-Time Notifications**: Get notified when swaps are executed or fail

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Telegram Bot token (create one through [@BotFather](https://t.me/BotFather))
- API keys:
  - [Moralis](https://developers.moralis.com/) for blockchain data
  - [1inch](https://1inch.io/) for EVM swaps
  - [Jupiter](https://jup.ag/) for Solana swaps (API key is not mandatory)
  - RPC Provider URLs for each blockchain

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/bharathbabu-moralis/telegram-copy-trading-bot.git
cd telegram-copy-trading-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create .env file

Create a `.env` file in the root directory with the following variables:

```
# MongoDB
MONGODB_URI=mongodb://localhost:27017/copyTradingBot

# Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# API Keys
MORALIS_API_KEY=your_moralis_api_key
INCH_API_KEY=your_1inch_api_key

# RPC URLs
ETH_RPC_URL=your_ethereum_rpc_url
BASE_RPC_URL=your_base_rpc_url
POLYGON_RPC_URL=your_polygon_rpc_url
SOLANA_RPC_URL=your_solana_rpc_url

# Wallet Private Keys (Keep secure!)
ETH_PRIVATE_KEY=your_ethereum_private_key
SOLANA_PRIVATE_KEY=your_solana_private_key

# Configuration
SWAP_PROCESSING_FREQ=30000
NEW_SWAP_POLLING_FREQ=60000
CLEANUP_FREQ=3600000
```

### 4. Initialize the database

```bash
node scripts/initDb.js
```

### 5. Start the bot

```bash
node src/index.js
```

## Using the Bot

After starting the bot, open Telegram and search for your bot. Start a conversation and use the following commands:

### Commands

- `/start` - Initialize the bot and set your chat ID for notifications
- `/help` - Show available commands
- `/add <address> <chain>` - Add a wallet to track (e.g., `/add 0x123...abc eth`)
- `/remove <address> <chain>` - Remove a tracked wallet
- `/list` - List all tracked wallets
- `/status` - Check bot status and statistics
- `/balance <chain>` - Check your wallet balance on a specific chain

## How It Works

1. **Wallet Tracking**: You add wallets to track using the `/add` command
2. **Swap Detection**: The bot periodically checks for new swaps from these wallets using Moralis API
3. **Swap Execution**: When a new swap is detected, the bot:
   - For EVM chains: Uses 1inch API to execute the same swap
   - For Solana: Uses Jupiter API to execute the swap
4. **Notifications**: You receive a Telegram notification about successful or failed swaps

## 🔧 Architecture

The project follows a modular architecture:

- **/src/telegram**: Handles Telegram bot commands and messaging
- **/src/db/models**: MongoDB models for data storage
- **/src/services/polling**: Background services for checking new swaps
- **/src/services/execution**: Swap execution logic
- **/src/services/wallets**: Wallet management for different chains
- **/src/services/moralis**: Interfaces with Moralis API

## ⚠️ Security Notes

- **Private Keys**: This bot requires your wallet's private keys to execute trades. Store them securely and run the bot on a trusted server.
- **Fund Management**: Start with small amounts to test the bot before committing larger funds.
- **API Keys**: Protect your API keys and avoid sharing your .env file.

## Acknowledgements

- Moralis for blockchain data APIs
- 1inch for EVM swap aggregation
- Jupiter for Solana swap aggregation
- node-telegram-bot-api for Telegram integration

---

Built with ❤️ by [Bharath Babu](https://github.com/bharathbabu-moralis)
# solana-trading-bot- 
# solana-trading 
