const mongoose = require('mongoose');

const alertHistorySchema = new mongoose.Schema({
    tokenAddress: { type: String, required: true, index: true },
    alertType: { type: String, required: true }, // 'mint' or 'liquidity_init'
    chatId: { type: String, required: true },
    sentAt: { type: Date, default: Date.now, expires: '7d' } // Auto-delete after 7 days
});

// Ensure we don't send the same alert type for the same token to the same chat
alertHistorySchema.index({ tokenAddress: 1, alertType: 1, chatId: 1 }, { unique: true });

module.exports = mongoose.model('AlertHistory', alertHistorySchema);
