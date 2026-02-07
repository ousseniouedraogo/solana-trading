# Market Cap Filter - Configuration Guide

## Quick Setup

Add these lines to your `.env` file:

```bash
# Market Cap Filter Settings
AUTO_SNIPE_MCAP_FILTER=true
AUTO_SNIPE_TARGET_MCAP_MIN=4500
AUTO_SNIPE_TARGET_MCAP_MAX=4800
```

## How It Works

When enabled, the market cap filter automatically rejects snipe targets that don't meet your criteria:

1. **Token Detected** → Bot creates snipe target
2. **Market Cap Check** → Queries DexScreener API  
3. **Decision**:
   - ✅ **In Range (4.5K-4.8K)** → Proceeds with snipe
   - ❌ **Too Low** → Rejects (you get notified)
   - ❌ **Too High** → Rejects (you get notified)

## Testing

Run the test script to verify configuration:

```bash
node scripts/test-market-cap-filter.js
```

Expected output:
```
✅ Market Cap Filter is working correctly!

📊 Configuration:
   • Target Range: $4,500 - $4,800
   • Data Source: DexScreener API (free)
   • Cache Size: X entries
```

## Configuration Options

### Target Range

Customize the market cap range by editing your `.env`:

```bash
# Only snipe tokens between $10K and $15K
AUTO_SNIPE_TARGET_MCAP_MIN=10000
AUTO_SNIPE_TARGET_MCAP_MAX=15000
```

### Disable Filter

To disable while keeping auto-snipe active:

```bash
AUTO_SNIPE_MCAP_FILTER=false
```

## Features

### 1. Automatic Filtering
- Checks market cap before executing snipe
- Saves your SOL by avoiding bad trades
- Real-time data from DexScreener

### 2. Smart Caching
- Caches market cap data for 30 seconds
- Reduces API calls
- Faster repeated checks

### 3. User Notifications
When a token is rejected, you receive a message:
```
❌ Snipe Rejected: Market Cap Filter

🪙 Token: EXAMPLE
📊 Market Cap: $125,000
🚫 Reason: Market cap too high ($125000 > $4800)
🎯 Target Range: $4,500 - $4,800
```

## Data Source

**DexScreener API**:
- ✅ Free (no authentication required)
- ✅ Real-time market data
- ✅ Covers all Solana DEXs
- ⚠️ New tokens may not be indexed immediately (filter will skip if no data)

## Advanced Usage

### Programmatic Configuration

You can update the target range dynamically:

```javascript
const marketCapFilter = require("./src/services/sniping/marketCapFilter");

// Set new range
marketCapFilter.setTargetRange(5000, 10000);

// Get current config
const config = marketCapFilter.getConfig();
console.log(config);
// { targetMin: 5000, targetMax: 10000, cacheSize: 5, ... }
```

### Manual Check

```javascript
const result = await marketCapFilter.shouldSnipe("TOKEN_MINT_ADDRESS");

if (result.shouldSnipe) {
    console.log(`✅ Ready to snipe! MC: $${result.marketCap}`);
} else {
    console.log(`❌ ${result.reason}`);
}
```

## Troubleshooting

### Filter Not Working

1. Check `.env` has `AUTO_SNIPE_MCAP_FILTER=true`
2. Verify bot has internet access for DexScreener API
3. Run test script to confirm setup

### Always Rejecting

1. Check target range is realistic (4.5K-4.8K is VERY narrow)
2. Verify tokens you're tracking create pools in that range
3. Consider widening range (e.g., 1K-50K for testing)

### No Data Available

- **Cause**: Token too new, not indexed by DexScreener
- **Solution**: Filter will skip and proceed with snipe (safe default)

## Best Practices

1. **Start Wide**: Use a wider range (1K-100K) for testing
2. **Narrow Down**: Once you see typical market caps, adjust range
3. **Monitor**: Watch notifications to calibrate thresholds
4. ** Test First**: Always run test script before live sniping

## Performance Impact

- ⏱️ **Adds ~200-500ms** latency to snipe decision
- 💾 **Minimal memory**: ~1KB per cached token
- 🌐 **API calls**: 1 per new token (cached for 30s)

This is negligible compared to the value of avoiding bad snipes!
