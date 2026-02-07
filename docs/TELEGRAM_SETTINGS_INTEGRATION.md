# Integration Guide: Telegram Settings Commands

This document explains how to integrate the new settings commands into your Telegram bot.

## Files Created

- `src/telegram/commands/settings.js` - Complete settings module with inline keyboards

## Integration Steps

### 1. Add Import to solana-bot.js

Add at the top of `solana-bot.js` with other imports:

```javascript
const {
    handleSettingsCommand,
    handleSettingsCallback
} = require("./src/telegram/commands/settings");
```

### 2. Add /settings Command

Find the section where commands are defined (around bot.onText) and add:

```javascript
// Settings command - Main configuration menu
bot.onText(/\/settings/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        await handleSettingsCommand(bot, chatId);
    } catch (error) {
        console.error("Error in /settings command:", error);
        await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});
```

### 3. Add to Command List

Update the `setBotCommands()` function to include the new command:

```javascript
const commands = [
    { command: "start", description: "🚀 Start & Initialize Chat ID" },
    { command: "help", description: "❓ Show available commands" },
    // ... existing commands ...
    { command: "settings", description: "⚙️ Bot  settings & configuration" },  // ADD THIS
    { command: "positions", description: "📊 View open trading positions" },
    { command: "guide", description: "📖 How the bot works & Architecture" }
];
```

### 4. Add Callback Query Handler

Find or create the callback query handler section:

```javascript
// Callback query handler for inline buttons
bot.on('callback_query', async (query) => {
    try {
        // Handle settings callbacks
        if (query.callback_data.startsWith('settings_') ||
            query.callback_data.startsWith('mcap_') ||
            query.callback_data.startsWith('tpsl_')) {
            await handleSettingsCallback(bot, query);
            return;
        }

        // ... existing callback handlers ...

    } catch (error) {
        console.error("Error handling callback query:", error);
        await bot.answerCallbackQuery(query.id, {
            text: "❌ Error: " + error.message,
            show_alert: true
        });
    }
});
```

## Usage

Once integrated, users can:

1. **Open Settings Menu**:
   ```
   /settings
   ```

2. **Navigate with Inline Buttons**:
   - 📊 Market Cap Filter → View/modify range, use presets
   - 🎯 TP/SL Config → Adjust take profit/stop loss
   - ⚡ Fast Executor Stats → View performance metrics
   - 🔧 Auto-Snipe Settings → (placeholder for future)

3. **Quick Actions**:
   - Toggle filter on/off
   - Select preset ranges (Micro/Small/Medium/Large)
   - Apply TP/SL presets (Conservative/Balanced/Aggressive)
   - Refresh stats in real-time

## Features

### Market Cap Filter
- **Presets**:
  - 🎯 Micro: $1K - $10K
  - 📈 Small: $10K - $50K (current default)
  - 🚀 Medium: $50K - $200K
  - 💎 Large: $200K - $1M

### TP/SL Configuration
- **Presets**:
  - Conservative: 50% TP / 10% SL
  - Balanced: 75% TP / 20% SL (current default)
  - Aggressive: 150% TP / 30% SL

### Fast Executor Stats
- Cached transactions count
- Current priority fee
- RPC status (Premium vs Public)
- Expected latency

## Notes

- Settings changes via presets apply immediately to the running bot
- Some settings (like enabling/disabling filters) require `.env` changes
- All callbacks use inline keyboards for smooth UX
- Stats refresh on demand with "🔄 Refresh" button

## Testing

After integration, test with:
```
/settings
```

Then navigate through each menu option to verify all buttons work correctly.
