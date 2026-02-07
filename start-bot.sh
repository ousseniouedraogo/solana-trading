#!/bin/bash
echo "🌟 Starting Solana-Focused Trading Bot..."

# Kill any existing bot processes
pkill -f "node manual-bot.js" 2>/dev/null
pkill -f "node comprehensive-bot.js" 2>/dev/null
pkill -f "node solana-bot.js" 2>/dev/null

# Start the Solana bot in background
nohup node solana-bot.js > bot.log 2>&1 &

echo "✅ Solana bot started in background"
echo "📝 Check bot.log for output"
echo "🛑 Use: pkill -f 'node solana-bot.js' to stop"