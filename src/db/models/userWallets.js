// User wallet storage model
const mongoose = require("mongoose");

const userWalletSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  publicKey: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return v && v.length >= 32 && v.length <= 44; // Solana public key length
      },
      message: 'Invalid Solana public key format'
    }
  },
  privateKey: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return v && v.length >= 64; // Base58 encoded private key
      },
      message: 'Invalid private key format'
    }
  },
  walletName: {
    type: String,
    default: "Main Wallet"
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  // Security fields
  encrypted: {
    type: Boolean,
    default: false
  },
  encryptionMethod: {
    type: String,
    default: "none"
  }
});

// Ensure one active wallet per user
userWalletSchema.index({ userId: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

// Update lastUsed on any update
userWalletSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastUsed = new Date();
  }
  next();
});

module.exports = mongoose.model("UserWallet", userWalletSchema);