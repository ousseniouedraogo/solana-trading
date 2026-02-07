# Optimized RPC Configuration Guide

## Quick Setup Instructions

### 1. Choose an RPC Provider

For optimal sniping performance (150-300ms latency), you need a premium RPC. Here are the recommended options:

#### Option A: Helius (Recommended)
- **Cost**: $50-99/month (Build tier)
- **Benefits**: Best for trading bots, dedicated endpoints
- **Setup**:
  1. Sign up at https://helius.dev
  2. Create a new project
  3. Copy your RPC URL and WSS URL

#### Option B: QuickNode
- **Cost**: $49-299/month (Build tier)
- **Benefits**: Reliable, good analytics
- **Setup**:
  1. Sign up at https://quicknode.com
  2. Create Solana endpoint
  3. Copy HTTP and WSS URLs

#### Option C: Triton (Advanced)
- **Cost**: Custom pricing
- **Benefits**: Specialized for high-frequency trading
- **Setup**: Contact https://triton.one

### 2. Update Your .env File

Add these lines to your `.env`:

```bash
# Optimized RPC Settings
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
SOLANA_WSS_URL=wss://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY

# Fast Executor Settings
FAST_SNIPE_ENABLED=true
FAST_SNIPE_SKIP_PREFLIGHT=true
FAST_SNIPE_MAX_RETRIES=3

# Priority Fee Settings (in microlamports)
PRIORITY_FEE_MIN=1000
PRIORITY_FEE_MAX=100000
PRIORITY_FEE_PERCENTILE=90
```

### 3. Enable Fast Execution

The FastExecutor will automatically activate when:
- `FAST_SNIPE_ENABLED=true` is set
- A premium RPC URL is detected
- The bot detects a new token creation

### 4. Performance Expectations

With this setup, you should achieve:
- **Detection to execution**: 150-300ms
- **Transaction confirmation**: 400-600ms (network dependent)
- **Total time (detection to confirmed)**: ~800ms

This puts you in the **top 5%** of Solana trading bots.

## Testing Your Setup

Run this command to benchmark performance:

```bash
node scripts/test-fast-executor.js
```

Expected output:
```
⚡ FastExecutor initialized
⏱️  Average latency: 245ms
✅ Setup optimal for competitive sniping
```

## Cost Optimization

If $100/month is too expensive, you can:
1. Start with free RPC and upgrade when profitable
2. Use Helius "Developer" tier ($9/mo) for testing
3. Share costs with a partner trader

## Important Notes

⚠️ **Free RPCs (like public Solana endpoints) will NOT achieve < 1 second latency**
✅ **Premium RPC is mandatory** for competitive sniping
💡 Consider this an investment - one successful snipe pays for months of RPC fees
