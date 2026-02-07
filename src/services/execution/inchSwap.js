// src/services/execution/inchSwap.js
const axios = require("axios");
const { ethers } = require("ethers");
const { getEvmWallet, getEvmProvider } = require("../wallets/evm");
require("dotenv").config();

// ERC20 token approval ABI
const erc20ApprovalAbi = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// Native token addresses for EVM chains
const NATIVE_TOKEN_ADDRESSES = {
  eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  base: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // 1inch format for all native tokens
  polygon: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  arbitrum: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  optimism: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  avalanche: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
};

// Chain-specific native token addresses (actual blockchain addresses)
const CHAIN_NATIVE_TOKENS = {
  eth: "0x0000000000000000000000000000000000000000",
  base: "0x4200000000000000000000000000000000000006",
  polygon: "0x0000000000000000000000000000000000001010",
  arbitrum: "0x912CE59144191C1204E64559FE8253a0e49E6548",
  optimism: "0x4200000000000000000000000000000000000006",
  avalanche: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
};

// 1inch router addresses by chain (latest v6)
const INCH_ROUTER_ADDRESSES = {
  1: "0x1111111254eeb25477b68fb85ed929f73a960582", // Ethereum Mainnet
  137: "0x1111111254eeb25477b68fb85ed929f73a960582", // Polygon
  10: "0x1111111254eeb25477b68fb85ed929f73a960582", // Optimism
  42161: "0x1111111254eeb25477b68fb85ed929f73a960582", // Arbitrum
  43114: "0x1111111254eeb25477b68fb85ed929f73a960582", // Avalanche
  8453: "0x111111125421ca6dc452d289314280a0f8842a65", // Base (different address)
};

// Execute a swap using 1inch for EVM chains
const executeInchSwap = async (swap, chain) => {
  try {
    console.log(
      `Executing 1inch swap on ${chain.name} for tx: ${swap.sourceTxHash}`
    );

    const wallet = getEvmWallet(chain);
    const provider = getEvmProvider(chain);
    const walletAddress = wallet.address;

    // Determine which token is being swapped from
    const fromToken = swap.tokenIn;
    const toToken = swap.tokenOut;

    console.log(
      `Swapping ${fromToken.amount} ${fromToken.symbol} to ${toToken.symbol}`
    );

    // Check if fromToken is a native token
    const isFromNative = isNativeToken(fromToken.address, chain.chainId);
    const isToNative = isNativeToken(toToken.address, chain.chainId);

    console.log(`From token is native: ${isFromNative}`);
    console.log(`To token is native: ${isToNative}`);

    // Handle native token special address format for 1inch
    const INCH_NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

    const fromTokenAddress = isFromNative
      ? INCH_NATIVE_TOKEN
      : fromToken.address;
    const toTokenAddress = isToNative ? INCH_NATIVE_TOKEN : toToken.address;

    console.log(`Using from token address: ${fromTokenAddress}`);
    console.log(`Using to token address: ${toTokenAddress}`);

    // Get the correct 1inch router address for this chain
    const inchChainId = getInchChainId(chain.chainId);
    if (!inchChainId) {
      throw new Error(`Chain ${chain.chainId} not supported by 1inch`);
    }

    const routerAddress = INCH_ROUTER_ADDRESSES[inchChainId];
    if (!routerAddress) {
      throw new Error(`No router address found for chain ID ${inchChainId}`);
    }

    console.log(`Using 1inch router address: ${routerAddress}`);

    // Check if we have sufficient balance before proceeding
    let hasBalance = false;
    let actualBalance = "0";
    let tokenDecimals = fromToken.decimals; // Default to provided decimals

    try {
      if (isFromNative) {
        // Check native token balance
        const balance = await provider.getBalance(walletAddress);
        const requiredAmount = ethers.utils.parseUnits(
          fromToken.amount.toString(),
          tokenDecimals
        );

        console.log(`Raw native balance: ${balance.toString()}`);
        console.log(`Required raw amount: ${requiredAmount.toString()}`);

        actualBalance = ethers.utils.formatUnits(balance, tokenDecimals);
        console.log(`Native balance: ${actualBalance} ${fromToken.symbol}`);
        console.log(`Required amount: ${fromToken.amount} ${fromToken.symbol}`);

        hasBalance = balance.gte(requiredAmount);
      } else {
        // Check ERC20 token balance
        if (!ethers.utils.isAddress(fromToken.address)) {
          throw new Error(`Invalid token address format: ${fromToken.address}`);
        }

        const tokenContract = new ethers.Contract(
          fromToken.address,
          erc20ApprovalAbi,
          provider
        );

        // Verify we can interact with the token contract
        try {
          const symbol = await tokenContract.symbol();
          console.log(`Verified token symbol: ${symbol}`);

          // Get the actual decimals from the contract
          tokenDecimals = await tokenContract.decimals();
          console.log(`Token decimals from contract: ${tokenDecimals}`);
          console.log(`Token decimals from params: ${fromToken.decimals}`);
        } catch (e) {
          throw new Error(
            `Cannot interact with token at ${fromToken.address}: ${e.message}`
          );
        }

        // Get balance and required amount using the correct decimals
        const balance = await tokenContract.balanceOf(walletAddress);
        console.log(`Raw token balance: ${balance.toString()}`);

        const requiredAmount = ethers.utils.parseUnits(
          fromToken.amount.toString(),
          tokenDecimals
        );
        console.log(`Required raw amount: ${requiredAmount.toString()}`);

        // Always compare raw BigNumber values
        hasBalance = balance.gte(requiredAmount);

        // Format for display using correct decimals
        actualBalance = ethers.utils.formatUnits(balance, tokenDecimals);
        console.log(`Token balance: ${actualBalance} ${fromToken.symbol}`);
        console.log(`Required amount: ${fromToken.amount} ${fromToken.symbol}`);
      }
    } catch (balanceError) {
      console.error(`Error checking balance: ${balanceError.message}`);
      throw new Error(`Failed to check balance: ${balanceError.message}`);
    }

    if (!hasBalance) {
      throw new Error(
        `Insufficient balance to execute swap. You have ${actualBalance} ${fromToken.symbol} but need ${fromToken.amount} ${fromToken.symbol}`
      );
    }

    // Parse the amount with the correct decimals we just verified
    const amount = ethers.utils
      .parseUnits(fromToken.amount.toString(), tokenDecimals)
      .toString();

    // Check and approve token allowance if needed (skip for native tokens)
    if (!isFromNative) {
      try {
        console.log(`Checking allowance for token ${fromToken.address}...`);
        await checkAndApproveAllowance(
          wallet,
          fromToken.address,
          routerAddress,
          amount,
          tokenDecimals // Use the verified token decimals
        );
      } catch (approvalError) {
        console.error(`Approval error: ${approvalError.message}`);
        throw new Error(`Failed to approve token: ${approvalError.message}`);
      }
    } else {
      console.log("Swapping native token, no approval needed.");
    }

    // Build the 1inch API URL
    const apiUrl = `https://api.1inch.dev/swap/v6.0/${inchChainId}/swap`;

    // Create the swap parameters
    const swapParams = {
      src: fromTokenAddress,
      dst: toTokenAddress,
      amount: amount,
      from: walletAddress,
      slippage: 1, // 1% slippage
      disableEstimate: false,
    };

    // Log the full parameters for debugging
    console.log("1inch API parameters:", JSON.stringify(swapParams, null, 2));

    // Make the API request to 1inch
    const headers = {
      Authorization: `Bearer ${process.env.INCH_API_KEY}`,
      "Content-Type": "application/json",
    };

    try {
      const swapResponse = await axios.get(apiUrl, {
        headers,
        params: swapParams,
      });

      const swapData = swapResponse.data;

      if (!swapData || !swapData.tx) {
        throw new Error("Invalid swap data received from 1inch");
      }

      // Execute the transaction
      const tx = {
        from: walletAddress,
        to: swapData.tx.to,
        data: swapData.tx.data,
        value: swapData.tx.value,
        gasPrice: swapData.tx.gasPrice,
        gasLimit: Math.floor(swapData.tx.gas * 1.2), // Add 20% buffer to gas limit
      };

      // Sign and send the transaction without waiting for confirmation
      const txResponse = await wallet.sendTransaction(tx);
      console.log(`Transaction sent! Hash: ${txResponse.hash}`);

      // Return success without waiting for confirmation
      return {
        success: true,
        txHash: txResponse.hash,
        message: "Transaction submitted to the network",
      };
    } catch (apiError) {
      // Handle 1inch API errors more gracefully
      if (apiError.response && apiError.response.data) {
        const errorData = apiError.response.data;
        console.error("1inch API error details:", errorData);

        if (
          errorData.description &&
          errorData.description.includes("allowance")
        ) {
          throw new Error(
            `Approval error: ${errorData.description}. Please try again.`
          );
        }

        throw new Error(
          `1inch API error: ${
            errorData.description || errorData.error || "Unknown API error"
          }`
        );
      }

      throw apiError; // Rethrow if not a handled error type
    }
  } catch (error) {
    console.error("Error executing 1inch swap:", error);
    return {
      success: false,
      error: error.message || "Unknown error during swap execution",
    };
  }
};

// Helper function to check if a token is a native token
function isNativeToken(tokenAddress, chainId) {
  // First check the standard native address
  if (tokenAddress === "0x0000000000000000000000000000000000000000") {
    return true;
  }

  // Then check chain-specific native addresses
  const chainNativeAddress = CHAIN_NATIVE_TOKENS[chainId];
  if (
    chainNativeAddress &&
    tokenAddress.toLowerCase() === chainNativeAddress.toLowerCase()
  ) {
    return true;
  }

  // Check 1inch format
  if (tokenAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
    return true;
  }

  return false;
}

// Helper function to check token allowance and approve if needed
async function checkAndApproveAllowance(
  wallet,
  tokenAddress,
  spenderAddress,
  amount,
  decimals
) {
  console.log(
    `Checking allowance for ${tokenAddress} to spend to ${spenderAddress}`
  );
  // Validate token address
  if (!ethers.utils.isAddress(tokenAddress)) {
    throw new Error(`Invalid token address format: ${tokenAddress}`);
  }

  // Skip zero address or native token addresses
  if (
    tokenAddress === "0x0000000000000000000000000000000000000000" ||
    tokenAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
  ) {
    throw new Error(
      `Cannot approve native token or zero address: ${tokenAddress}`
    );
  }

  try {
    // Create contract instance
    const tokenContract = new ethers.Contract(
      tokenAddress,
      erc20ApprovalAbi,
      wallet
    );

    // First, verify we can interact with this contract
    try {
      const symbol = await tokenContract.symbol();
      console.log(`Token symbol: ${symbol}`);
    } catch (e) {
      console.error(`Error verifying token symbol: ${e.message}`);
      throw new Error(`Cannot interact with token at ${tokenAddress}`);
    }

    // Get current allowance
    const currentAllowance = await tokenContract.allowance(
      wallet.address,
      spenderAddress
    );
    console.log(
      `Current allowance: ${ethers.utils.formatUnits(
        currentAllowance,
        decimals
      )} tokens`
    );

    // If allowance is insufficient, approve
    if (currentAllowance.lt(ethers.BigNumber.from(amount))) {
      console.log(`Approving ${spenderAddress} to spend ${tokenAddress}...`);

      const approveTx = await tokenContract.approve(
        spenderAddress,
        ethers.constants.MaxUint256 // Infinite approval
      );

      console.log(`Approval transaction sent: ${approveTx.hash}`);
      await approveTx.wait(1);
      console.log("Token approval confirmed");
    } else {
      console.log("Sufficient allowance already exists");
    }

    return true;
  } catch (error) {
    console.error(`Approval error for token ${tokenAddress}:`, error);
    throw error; // Re-throw for proper handling
  }
}

// Helper function to get the correct chain ID for 1inch API
function getInchChainId(chainId) {
  const chainMap = {
    eth: 1,
    polygon: 137,
    optimism: 10,
    arbitrum: 42161,
    avalanche: 43114,
    base: 8453,
  };

  return chainMap[chainId];
}

module.exports = {
  executeInchSwap,
};
