// src/services/wallets/solana.js
const { Connection, PublicKey, Keypair, SystemProgram, Transaction } = require("@solana/web3.js");
const { getAccount, getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } = require("@solana/spl-token");
const base58 = require("base-58"); // Using base-58 package instead of bs58
const axios = require("axios");
require("dotenv").config();
const { getSolanaNativeBalance } = require("../moralis/solanaBalance");

// Create a Solana wallet from private key
const getSolanaWallet = () => {
  try {
    // Get private key from env (should be base58 encoded string)
    const privateKeyString = process.env.SOLANA_PRIVATE_KEY ? process.env.SOLANA_PRIVATE_KEY.trim() : null;

    if (!privateKeyString) {
      throw new Error("SOLANA_PRIVATE_KEY not found in environment variables");
    }

    // Convert base58 private key to Uint8Array
    const privateKeyBytes = base58.decode(privateKeyString);

    // Create keypair from private key
    const keypair = Keypair.fromSecretKey(Buffer.from(privateKeyBytes));

    return keypair;
  } catch (error) {
    console.error("Error creating Solana wallet:", error);
    throw new Error(`Failed to initialize Solana wallet: ${error.message}`);
  }
};

// Create a Solana connection
const getSolanaConnection = () => {
  try {
    let rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

    // If using QuickNode, append the API key if it's provided separately
    if (process.env.QUICKNODE_API_KEY && rpcUrl.includes("quiknode.pro") && !rpcUrl.includes(process.env.QUICKNODE_API_KEY)) {
      rpcUrl = rpcUrl.replace("your-api-key", process.env.QUICKNODE_API_KEY);
    }

    const config = { commitment: 'confirmed' };
    if (process.env.SOLANA_WSS_URL) {
      config.wsEndpoint = process.env.SOLANA_WSS_URL;
    }

    return new Connection(rpcUrl, config);
  } catch (error) {
    console.error("Error creating Solana connection:", error);
    throw new Error(`Failed to initialize Solana connection: ${error.message}`);
  }
};

// Get portfolio data using Moralis API
const getSolanaPortfolio = async (walletAddress) => {
  try {
    const apiKey = process.env.MORALIS_API_KEY;
    if (!apiKey) {
      throw new Error("MORALIS_API_KEY not found in environment variables");
    }

    const url = `https://solana-gateway.moralis.io/account/mainnet/${walletAddress}/portfolio?nftMetadata=false`;

    const response = await axios.get(url, {
      headers: {
        accept: "application/json",
        "X-API-Key": apiKey,
      },
    });

    return response.data;
  } catch (error) {
    console.error("Error fetching Solana portfolio from Moralis:", error);
    throw new Error(
      `Failed to fetch Solana portfolio: ${error.response?.data?.message || error.message
      }`
    );
  }
};

// Get balance of Solana wallet including tokens
const getSolanaBalance = async () => {
  try {
    const wallet = getSolanaWallet();
    const walletAddress = wallet.publicKey.toString();

    // Get portfolio data from Moralis (includes both SOL and tokens)
    const portfolio = await getSolanaPortfolio(walletAddress);

    // Format native SOL balance
    // Get native SOL balance specifically from Moralis (more accurate for native only)
    let solAmount = 0;
    try {
      const nativeData = await getSolanaNativeBalance(walletAddress);
      if (nativeData) {
        solAmount = parseFloat(nativeData.solana);
      } else {
        // Fallback to portfolio if specific balance call fails
        solAmount = parseFloat(portfolio.nativeBalance.solana);
      }
    } catch (e) {
      solAmount = parseFloat(portfolio.nativeBalance.solana);
    }

    // Format token balances
    const formattedTokens = [];

    if (portfolio.tokens && portfolio.tokens.length > 0) {
      for (const token of portfolio.tokens) {
        formattedTokens.push({
          symbol: token.symbol,
          name: token.name || token.symbol,
          amount: token.amount,
          decimals: token.decimals,
          address: token.mint,
        });
      }
    }

    // Format response
    const response = {
      address: walletAddress,
      native: {
        symbol: "SOL",
        name: "Solana",
        amount: solAmount.toString(),
        decimals: 9,
      },
      tokens: formattedTokens,
    };

    console.log(`SOL balance: ${solAmount} SOL`);
    if (formattedTokens.length > 0) {
      console.log(`Found ${formattedTokens.length} tokens in wallet`);
    }

    return response;
  } catch (error) {
    console.error("Error getting Solana balance:", error);
    throw error;
  }
};

// Get SPL token balance for a specific token (handles both Token and Token-2022 programs)
const getSplTokenBalance = async (tokenMintAddress, walletAddress = null) => {
  try {
    const connection = getSolanaConnection();
    const wallet = walletAddress ? new PublicKey(walletAddress) : getSolanaWallet().publicKey;
    const tokenMint = new PublicKey(tokenMintAddress);

    // 1. Try to find the mint's program owner if we can
    let programId = TOKEN_PROGRAM_ID;
    try {
      const mintInfo = await connection.getAccountInfo(tokenMint);
      if (mintInfo && mintInfo.owner.toString() === "TokenzQdBNbLqP5VEhdkscyc9BWFLCcMzg6G6xy1aA") {
        const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkscyc9BWFLCcMzg6G6xy1aA");
        programId = TOKEN_2022_PROGRAM_ID;
      }
    } catch (e) {
      console.warn(`Warning: Could not fetch mint info for ${tokenMintAddress}, defaulting to standard SPL`);
    }

    // 2. Get the associated token account address for the correct program
    const associatedTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      wallet,
      false, // allowOwnerOffCurve
      programId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      const tokenAccount = await getAccount(
        connection,
        associatedTokenAccount,
        'confirmed',
        programId
      );

      return {
        address: associatedTokenAccount.toString(),
        balance: tokenAccount.amount.toString(),
        exists: true,
        programId: programId.toString()
      };
    } catch (error) {
      // 3. Fallback: Search for ANY token account for this mint of this owner
      // This handles cases where the ATA might be different or multiple accounts exist
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          wallet,
          { mint: tokenMint }
        );

        if (tokenAccounts.value.length > 0) {
          // Use the first account (usually the main one)
          const account = tokenAccounts.value[0];
          return {
            address: account.pubkey.toString(),
            balance: account.account.data.parsed.info.tokenAmount.amount,
            exists: true,
            programId: account.account.owner.toString()
          };
        }
      } catch (e) { }

      // Token account truly doesn't exist
      if (error.name === 'TokenAccountNotFoundError' || error.message.includes('not found')) {
        return {
          address: associatedTokenAccount.toString(),
          balance: '0',
          exists: false,
          programId: programId.toString()
        };
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error getting SPL token balance for ${tokenMintAddress}:`, error);
    throw new Error(`Failed to get SPL token balance: ${error.message}`);
  }
};

// Check if wallet has sufficient token balance
const checkSufficientBalance = async (tokenMintAddress, requiredAmount, decimals, walletAddress = null) => {
  try {
    const connection = getSolanaConnection();
    const effectiveWalletAddress = walletAddress || getSolanaWallet().publicKey.toString();
    const walletPublicKey = new PublicKey(effectiveWalletAddress);

    if (tokenMintAddress === "So11111111111111111111111111111111111111112") {
      // Native SOL
      const balance = await connection.getBalance(walletPublicKey);

      // Convert required amount to lamports
      const requiredLamports = Math.floor(parseFloat(requiredAmount) * Math.pow(10, decimals));

      // Add buffer for transaction fees (0.01 SOL = 10,000,000 lamports)
      const neededAmount = requiredLamports + 10000000;

      return {
        hasBalance: balance >= neededAmount,
        currentBalance: balance.toString(),
        requiredAmount: neededAmount.toString(),
        formattedBalance: (balance / Math.pow(10, 9)).toString(),
        formattedRequired: (neededAmount / Math.pow(10, 9)).toString()
      };
    } else {
      // SPL Token
      const tokenInfo = await getSplTokenBalance(tokenMintAddress, effectiveWalletAddress);
      const requiredAmountRaw = Math.floor(parseFloat(requiredAmount) * Math.pow(10, decimals));

      return {
        hasBalance: tokenInfo.exists && BigInt(tokenInfo.balance) >= BigInt(requiredAmountRaw),
        currentBalance: tokenInfo.balance,
        requiredAmount: requiredAmountRaw.toString(),
        formattedBalance: tokenInfo.exists ? (parseFloat(tokenInfo.balance) / Math.pow(10, decimals)).toString() : '0',
        formattedRequired: requiredAmount,
        tokenAccountExists: tokenInfo.exists,
        tokenAccountAddress: tokenInfo.address
      };
    }
  } catch (error) {
    console.error('Error checking sufficient balance:', error);
    throw new Error(`Failed to check balance: ${error.message}`);
  }
};

// Get rent-exempt minimum for account creation
const getRentExemptMinimum = async (accountSize = 165) => {
  try {
    const connection = getSolanaConnection();
    const rentExemptMinimum = await connection.getMinimumBalanceForRentExemption(accountSize);
    return rentExemptMinimum;
  } catch (error) {
    console.error('Error getting rent exempt minimum:', error);
    throw new Error(`Failed to get rent exempt minimum: ${error.message}`);
  }
};

// Transfer native SOL
const transferSol = async (keypair, toAddress, amount) => {
  try {
    const connection = getSolanaConnection();
    const toPublicKey = new PublicKey(toAddress);
    const lamports = Math.floor(parseFloat(amount) * 1e9);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: toPublicKey,
        lamports,
      })
    );

    const signature = await connection.sendTransaction(transaction, [keypair]);
    await connection.confirmTransaction(signature, 'confirmed');

    return {
      success: true,
      signature,
      explorerUrl: `https://solscan.io/tx/${signature}`
    };
  } catch (error) {
    console.error('Error in transferSol:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  getSolanaWallet,
  getSolanaConnection,
  getSolanaBalance,
  getSplTokenBalance,
  checkSufficientBalance,
  getRentExemptMinimum,
  transferSol,
};
