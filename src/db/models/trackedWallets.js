// src/db/models/trackedWallets.js
const mongoose = require("mongoose");

const trackedWalletSchema = new mongoose.Schema(
  {
    address: {
      type: String,
      required: true,
      trim: true,
    },
    chain: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastChecked: {
      type: Date,
      default: null,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    addedBy: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ['copy_trading', 'dev_sniper'],
      default: 'copy_trading'
    },
  },
  {
    timestamps: true,
  }
);

trackedWalletSchema.index({ address: 1, chain: 1 }, { unique: true });

const TrackedWallet = mongoose.model("TrackedWallet", trackedWalletSchema);

module.exports = TrackedWallet;
