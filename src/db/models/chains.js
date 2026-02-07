// src/db/models/chains.js
const mongoose = require("mongoose");

const ChainSchema = new mongoose.Schema({
  chainId: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["evm", "solana"],
    required: true,
  },
  rpcUrl: {
    type: String,
    required: true,
  },
  moralisChainName: {
    type: String,
    required: true,
  },
  blockExplorer: {
    type: String,
    required: true,
  },
  // Optional fields for backward compatibility
  explorerUrl: {
    type: String,
    required: false,
  },
  explorerTxUrl: {
    type: String,
    required: false,
  },
  explorerAddressUrl: {
    type: String,
    required: false,
  },
  swapAggregator: {
    type: String,
    enum: ["1inch", "jupiter"],
    required: false, // Made optional
    default: function () {
      // Set default based on chain type
      return this.type === "evm" ? "1inch" : "jupiter";
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  nativeToken: {
    symbol: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: false,
    },
    decimals: {
      type: Number,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
  },
});

// Add virtual properties for explorer URLs
ChainSchema.virtual("getExplorerTxUrl").get(function () {
  return this.explorerTxUrl || `${this.blockExplorer}/tx/{hash}`;
});

ChainSchema.virtual("getExplorerAddressUrl").get(function () {
  if (this.explorerAddressUrl) return this.explorerAddressUrl;

  if (this.type === "solana") {
    return `${this.blockExplorer}/account/{address}`;
  }
  return `${this.blockExplorer}/address/{address}`;
});

ChainSchema.virtual("getExplorerUrl").get(function () {
  return this.explorerUrl || this.blockExplorer;
});

// Set toJSON and toObject options to include virtuals
ChainSchema.set("toJSON", { virtuals: true });
ChainSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Chain", ChainSchema);
