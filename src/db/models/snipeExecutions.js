// src/db/models/snipeExecutions.js
const mongoose = require("mongoose");

const snipeExecutionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SnipeTarget",
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
    status: {
      type: String,
      enum: ["pending", "success", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    // Execution details
    amountIn: {
      type: Number,
      required: true, // SOL amount spent
    },
    amountOut: {
      type: Number,
      default: 0, // Tokens received
    },
    executionPrice: {
      type: Number,
      default: 0, // Price per token in SOL
    },
    slippageActual: {
      type: Number,
      default: 0, // Actual slippage experienced
    },
    slippageTarget: {
      type: Number,
      required: true, // Target slippage setting
    },
    priorityFee: {
      type: Number,
      required: true, // Priority fee paid
    },
    // Timing metrics
    detectionTime: {
      type: Date,
      required: true, // When opportunity was detected
    },
    executionStartTime: {
      type: Date,
      required: true, // When execution began
    },
    executionEndTime: {
      type: Date,
      default: null, // When execution completed
    },
    confirmationTime: {
      type: Date,
      default: null, // When transaction was confirmed
    },
    totalExecutionMs: {
      type: Number,
      default: 0, // Total time from detection to confirmation
    },
    // Blockchain details
    transactionHash: {
      type: String,
      default: null,
    },
    blockNumber: {
      type: Number,
      default: null,
    },
    blockHash: {
      type: String,
      default: null,
    },
    // Market data at execution
    marketData: {
      liquiditySOL: {
        type: Number,
        default: 0,
      },
      marketCapAtExecution: {
        type: Number,
        default: 0,
      },
      priceImpact: {
        type: Number,
        default: 0,
      },
      poolAddress: {
        type: String,
        default: null,
      },
    },
    // Error details (if failed)
    errorDetails: {
      errorCode: {
        type: String,
        default: null,
      },
      errorMessage: {
        type: String,
        default: null,
      },
      retryAttempts: {
        type: Number,
        default: 0,
      },
    },
    // Performance metrics
    profitLoss: {
      unrealizedPnL: {
        type: Number,
        default: 0,
      },
      realizedPnL: {
        type: Number,
        default: 0,
      },
      currentValue: {
        type: Number,
        default: 0,
      },
      lastUpdated: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
snipeExecutionSchema.index({ userId: 1, status: 1 });
snipeExecutionSchema.index({ tokenAddress: 1, status: 1 });
snipeExecutionSchema.index({ detectionTime: 1, status: 1 });
snipeExecutionSchema.index({ transactionHash: 1 }, { unique: true, sparse: true });

// Instance methods
snipeExecutionSchema.methods.markAsSuccess = function (executionData) {
  this.status = "success";
  this.amountOut = executionData.amountOut;
  this.executionPrice = executionData.executionPrice;
  this.slippageActual = executionData.slippageActual;
  this.executionEndTime = new Date();
  this.transactionHash = executionData.transactionHash;
  this.blockNumber = executionData.blockNumber;
  this.totalExecutionMs = this.executionEndTime - this.executionStartTime;

  if (executionData.marketData) {
    this.marketData = { ...this.marketData, ...executionData.marketData };
  }

  return this.save();
};

snipeExecutionSchema.methods.markAsFailed = function (errorDetails) {
  this.status = "failed";
  this.executionEndTime = new Date();
  this.totalExecutionMs = this.executionEndTime - this.executionStartTime;
  this.errorDetails = {
    errorCode: errorDetails.code || "UNKNOWN_ERROR",
    errorMessage: errorDetails.message || "Unknown error occurred",
    retryAttempts: this.errorDetails.retryAttempts + 1,
  };

  return this.save();
};

snipeExecutionSchema.methods.updateProfitLoss = function (currentPrice, currentValue) {
  if (this.status !== "success") return;

  const costBasis = this.amountIn;
  this.profitLoss.currentValue = currentValue;
  this.profitLoss.unrealizedPnL = currentValue - costBasis;
  this.profitLoss.lastUpdated = new Date();

  return this.save();
};

// Static methods
snipeExecutionSchema.statics.getExecutionStats = function (userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        userId: userId,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmountIn: { $sum: "$amountIn" },
        avgExecutionTime: { $avg: "$totalExecutionMs" },
        avgSlippage: { $avg: "$slippageActual" },
      },
    },
  ]);
};

snipeExecutionSchema.statics.getRecentExecutions = function (userId, limit = 10) {
  return this.find({ userId: userId })
    .populate("targetId")
    .sort({ createdAt: -1 })
    .limit(limit);
};

const SnipeExecution = mongoose.model("SnipeExecution", snipeExecutionSchema);

module.exports = SnipeExecution;