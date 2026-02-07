// src/utils/notifier.js
const axios = require("axios");
require("dotenv").config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Sends a notification to a specific chat ID via axios
 * @param {string} chatId - Target Telegram chat ID
 * @param {string} text - Message text
 * @param {object} options - Options like parse_mode
 */
const sendMessage = async (chatId, text, options = { parse_mode: 'HTML' }) => {
    try {
        if (!BOT_TOKEN) {
            console.warn("⚠️ Cannot send message: No TELEGRAM_BOT_TOKEN found in .env");
            return;
        }

        let targetChatId = chatId;
        if (!targetChatId) {
            // Fallback to admin ID if no chatId provided
            targetChatId = process.env.TELEGRAM_ADMIN_ID || process.env.ADMIN_CHAT_ID;
        }

        if (!targetChatId) {
            console.warn("⚠️ Cannot send message: No target chat ID provided");
            return;
        }

        const messageData = {
            chat_id: targetChatId,
            text: text,
            parse_mode: options.parse_mode || 'HTML',
            disable_web_page_preview: options.disable_web_page_preview || false
        };

        if (options.reply_markup) {
            messageData.reply_markup = options.reply_markup;
        }

        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const response = await axios.post(url, messageData);
        return response.data;
    } catch (error) {
        console.error("❌ Error sending message via notifier:", error.response?.data || error.message);
        // Don't throw to avoid crashing the background service if notification fails
        return null;
    }
};

module.exports = {
    sendMessage
};
