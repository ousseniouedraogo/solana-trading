# 🚀 Deploying to Railway.app

This guide will walk you through deploying your **Telegram Copy Trading Bot** to [Railway.app](https://railway.app/).

## Prerequisites

- A GitHub account.
- A [Railway.app](https://railway.app/) account (login with GitHub recommended).
- Your project pushed to a GitHub repository.

## Step 1: Project Setup on Railway

1.  **Login** to your Railway Dashboard.
2.  Click **+ New Project**.
3.  Select **Deploy from GitHub repo**.
4.  Select your repository (`telegram-copy-trading-bot-moralis`).
5.  Click **Deploy Now**.

## Step 2: Environment Variables (Critical!)

Your bot needs its secrets to function. You must add them manually in Railway.

1.  Click on your newly created project card.
2.  Go to the **Variables** tab.
3.  Click **New Variable** (or "Raw Editor" to paste multiple).
4.  Add the following variables exactly as they appear in your local `.env` file:

    | Variable Key | Description |
    | :--- | :--- |
    | `MONGODB_URI` | Your MongoDB connection string |
    | `TELEGRAM_BOT_TOKEN` | Your Bot Token from BotFather |
    | `TELEGRAM_ADMIN_ID` | Your Telegram User ID |
    | `MORALIS_API_KEY` | Your Moralis API Key |
    | `HELIUS_API_KEY` | Your Helius API Key |
    | `SOLANA_RPC_URL` | Your Helius RPC URL |
    | `SOLANA_WSS_URL` | Your Helius WSS URL |
    | `SOLANA_PRIVATE_KEY` | **(Optional)** If you want to use the .env wallet |
    | `AUTO_SNIPE_TRACKED` | `true` or `false` |
    | `AUTO_SNIPE_AMOUNT` | e.g., `0.01` |

    > [!IMPORTANT]
    > Do **NOT** paste the `PORT` variable. Railway handles this automatically if needed, though this bot is a worker.

## Step 3: Verify Deployment

1.  Go to the **Deployments** tab.
2.  You should see a build running or completed.
3.  Click on the latest deployment to view **Deploy Logs**.
4.  Look for the success message:
    ```
    🌟 Starting Solana Trading Bot in production mode...
    ✅ Solana bot commands menu set successfully
    ```

## Step 4: Maintenance

- **Updates:** Any time you push code to GitHub, Railway will automatically redeploy.
- **Monitoring:** Check the "Logs" tab in Railway to see your bot's activity in real-time.
