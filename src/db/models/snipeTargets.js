// src/db/models/snipeTargets.js
const mongoose = require("mongoose");

const snipeTargetSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    tokenAddress: {
      type: String,
      required: true,
      index: true,
    },
    tokenSymbol: {
      type: String,
      default: "UNKNOWN",
    },
    tokenName: {
      type: String,
      default: "",
    },
    targetAmount: {
      type: Number,
      required: true,
      min: 0.001, // Minimum 0.001 SOL
    },
    maxSlippage: {
      type: Number,
      required: true,
      default: 15.0,
      min: 0.5,
      max: 50.0,
    },
    minLiquidity: {
      type: Number,
      default: 5.0, // Minimum 5 SOL liquidity
      min: 0.1,
    },
    maxMarketCap: {
      type: Number,
      default: null, // No limit by default
    },
    priorityFee: {
      type: Number,
      default: 0.01, // 0.01 SOL priority fee
      min: 0.001,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    snipeStatus: {
      type: String,
      enum: ["pending", "executed", "failed", "cancelled", "paused", "closed", "rejected"],
      default: "pending",
      index: true,
    },
    triggerCondition: {
      type: String,
      enum: ["liquidity_added", "first_buy", "manual"],
      default: "liquidity_added",
    },
    autoSell: {
      enabled: {
        type: Boolean,
        default: false,
      },
      takeProfitPercent: {
        type: Number,
        default: 100, // 100% profit target
        min: 10,
      },
      stopLossPercent: {
        type: Number,
        default: 50, // 50% stop loss
        min: 10,
        max: 90,
      },
    },
    executionAttempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    lastAttempt: {
      type: Date,
      default: null,
    },
    executedAt: {
      type: Date,
      default: null,
    },
    executionPrice: {
      type: Number,
      default: null,
    },
    amountReceived: {
      type: Number,
      default: null,
    },
    transactionHash: {
      type: String,
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
snipeTargetSchema.index({ userId: 1, isActive: 1 });
snipeTargetSchema.index({ snipeStatus: 1, isActive: 1 });
snipeTargetSchema.index({ tokenAddress: 1, userId: 1 });

// Instance methods
snipeTargetSchema.methods.markAsExecuted = function (executionData) {
  this.snipeStatus = "executed";
  this.executedAt = new Date();
  this.executionPrice = executionData.price;
  this.amountReceived = executionData.amountReceived;
  this.transactionHash = executionData.transactionHash;
  this.isActive = false;
  return this.save();
};

snipeTargetSchema.methods.markAsFailed = function (reason) {
  this.executionAttempts += 1;
  this.lastAttempt = new Date();

  if (this.executionAttempts >= this.maxAttempts) {
    this.snipeStatus = "failed";
    this.isActive = false;
    this.notes = reason;
  }

  return this.save();
};

snipeTargetSchema.methods.pause = function () {
  this.snipeStatus = "paused";
  this.isActive = false;
  return this.save();
};

snipeTargetSchema.methods.resume = function () {
  this.snipeStatus = "pending";
  this.isActive = true;
  return this.save();
};

// Static methods
snipeTargetSchema.statics.getActiveTargets = function (userId = null) {
  const query = { isActive: true, snipeStatus: "pending" };
  if (userId) {
    query.userId = userId;
  }
  return this.find(query).sort({ createdAt: -1 });
};

snipeTargetSchema.statics.getTargetByToken = function (tokenAddress, userId) {
  return this.findOne({
    tokenAddress: tokenAddress,
    userId: userId,
    isActive: true
  });
};

const SnipeTarget = mongoose.model("SnipeTarget", snipeTargetSchema);

module.exports = SnipeTarget;