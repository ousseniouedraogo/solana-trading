// scripts/initDb.js
const mongoose = require("mongoose");
const Chain = require("../src/db/models/chains");
const BotConfig = require("../src/db/models/botConfig");
require("dotenv").config();

const initDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Initialize chains collection
    await initChains();

    // Initialize bot configuration
    await initBotConfig();

    console.log("Database initialization completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error initializing database:", error);
    process.exit(1);
  }
};

const initChains = async () => {
  // Check if chains collection is empty
  const chainCount = await Chain.countDocuments();

  if (chainCount > 0) {
    console.log("Chains collection already initialized. Skipping...");
    return;
  }

  console.log("Initializing chains collection...");

  // Define default chains
  const defaultChains = [
    {
      chainId: "eth",
      name: "Ethereum",
      type: "evm",
      rpcUrl: process.env.ETH_RPC_URL || "https://ethereum.publicnode.com",
      blockExplorer: "https://etherscan.io",
      swapAggregator: "1inch",
      isActive: true,
      nativeToken: {
        symbol: "ETH",
        name: "Ether",
        decimals: 18,
        address: "0x0000000000000000000000000000000000000000", // Zero address represents native token
      },
      moralisChainName: "eth",
    },
    {
      chainId: "base",
      name: "Base",
      type: "evm",
      rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      blockExplorer: "https://basescan.org",
      swapAggregator: "1inch",
      isActive: true,
      nativeToken: {
        symbol: "ETH",
        name: "Ether",
        decimals: 18,
        address: "0x4200000000000000000000000000000000000006", // Base's native ETH address
      },
      moralisChainName: "base",
    },
    {
      chainId: "polygon",
      name: "Polygon",
      type: "evm",
      rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      blockExplorer: "https://polygonscan.com",
      swapAggregator: "1inch",
      isActive: true,
      nativeToken: {
        symbol: "MATIC",
        name: "Matic",
        decimals: 18,
        address: "0x0000000000000000000000000000000000001010", // Polygon's native MATIC address
      },
      moralisChainName: "polygon",
    },
    {
      chainId: "solana",
      name: "Solana",
      type: "solana",
      rpcUrl:
        process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      blockExplorer: "https://solscan.io",
      swapAggregator: "jupiter",
      isActive: true,
      nativeToken: {
        symbol: "SOL",
        name: "Solana",
        decimals: 9,
        address: "So11111111111111111111111111111111111111112", // Solana's wrapped SOL address
      },
      moralisChainName: "solana",
    },
  ];

  // Add derived explorer URLs
  defaultChains.forEach((chain) => {
    // Set derived URLs for backwards compatibility
    chain.explorerUrl = chain.blockExplorer;

    if (chain.type === "solana") {
      chain.explorerTxUrl = `${chain.blockExplorer}/tx/{hash}`;
      chain.explorerAddressUrl = `${chain.blockExplorer}/account/{address}`;
    } else {
      chain.explorerTxUrl = `${chain.blockExplorer}/tx/{hash}`;
      chain.explorerAddressUrl = `${chain.blockExplorer}/address/{address}`;
    }
  });

  // Insert default chains
  await Chain.insertMany(defaultChains);
  console.log(`Inserted ${defaultChains.length} default chains`);
};

const initBotConfig = async () => {
  // Check if configuration already exists
  const configCount = await BotConfig.countDocuments();

  if (configCount > 0) {
    console.log(
      "Bot configuration already exists. Checking for required settings..."
    );

    // Ensure all required settings exist
    const requiredSettings = [
      {
        setting: "botStatus",
        value: "running",
        description: "Current status of the bot",
      },
      {
        setting: "notifyOnFailed",
        value: true,
        description: "Send notifications for failed swaps",
      },
    ];

    for (const setting of requiredSettings) {
      const exists = await BotConfig.findOne({ setting: setting.setting });

      if (!exists) {
        await BotConfig.create(setting);
        console.log(`Added missing setting: ${setting.setting}`);
      }
    }

    return;
  }

  console.log("Initializing bot configuration...");

  // Define default bot configuration
  const defaultConfig = [
    {
      setting: "botStatus",
      value: "running",
      description: "Current status of the bot",
    },
    {
      setting: "notifyOnFailed",
      value: true,
      description: "Send notifications for failed swaps",
    },
    // Add a default chatId if provided in environment
    ...(process.env.ADMIN_CHAT_ID
      ? [
          {
            setting: "chatId",
            value: process.env.ADMIN_CHAT_ID,
            description: "Primary chat ID for bot notifications",
          },
        ]
      : []),
  ];

  // Insert default configuration
  await BotConfig.insertMany(defaultConfig);
  console.log(
    `Inserted ${defaultConfig.length} default configuration settings`
  );
};

// Run the initialization
initDatabase();
