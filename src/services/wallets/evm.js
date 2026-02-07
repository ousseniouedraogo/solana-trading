// src/services/wallets/evm.js
const { ethers } = require("ethers");
const axios = require("axios");
require("dotenv").config();

// Standard ERC20 ABI for token interactions
const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const getEvmProvider = (chain) => {
  return new ethers.providers.JsonRpcProvider(chain.rpcUrl);
};

const getEvmWallet = (chain) => {
  const provider = getEvmProvider(chain);
  return new ethers.Wallet(process.env.EVM_PRIVATE_KEY, provider);
};

const getEvmBalance = async (chain) => {
  try {
    const wallet = getEvmWallet(chain);
    const walletAddress = wallet.address;

    // Use Moralis API to get token balances
    const response = await axios.get(
      `https://deep-index.moralis.io/api/v2.2/wallets/${walletAddress}/tokens`,
      {
        params: {
          chain: chain.moralisChainName,
        },
        headers: {
          accept: "application/json",
          "X-API-Key": process.env.MORALIS_API_KEY,
        },
      }
    );

    if (!response.data || !response.data.result) {
      throw new Error("Invalid response from Moralis API");
    }

    const result = response.data.result;

    // Find native token
    const nativeToken = result.find((token) => token.native_token === true);

    // Get other tokens
    const tokens = result
      .filter((token) => !token.native_token && !token.possible_spam)
      .map((token) => ({
        address: token.token_address,
        symbol: token.symbol,
        name: token.name,
        amount: token.balance_formatted,
        decimals: token.decimals,
        usdValue: token.usd_value || 0,
      }));

    return {
      address: walletAddress,
      native: nativeToken
        ? {
            symbol: nativeToken.symbol,
            amount: nativeToken.balance_formatted,
            usdValue: nativeToken.usd_value || 0,
          }
        : {
            symbol: chain.nativeToken.symbol,
            amount: "0",
            usdValue: 0,
          },
      tokens,
    };
  } catch (error) {
    console.error(
      `Error getting EVM balance for ${chain.chainId}:`,
      error.message
    );
    // Return a fallback response in case of error
    return {
      address: getEvmWallet(chain).address,
      native: {
        symbol: chain.nativeToken.symbol,
        amount: "0",
        usdValue: 0,
      },
      tokens: [],
    };
  }
};

// Function for token approval (used during swap execution)
const approveToken = async (tokenAddress, spenderAddress, amount, chain) => {
  try {
    const wallet = getEvmWallet(chain);
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);

    // Get current allowance
    const currentAllowance = await tokenContract.allowance(
      wallet.address,
      spenderAddress
    );

    // If allowance is insufficient, approve
    if (currentAllowance.lt(amount)) {
      console.log(
        `Approving ${spenderAddress} to spend token ${tokenAddress}...`
      );

      const approveTx = await tokenContract.approve(
        spenderAddress,
        ethers.constants.MaxUint256 // Infinite approval
      );

      console.log(`Approval transaction sent: ${approveTx.hash}`);
      await approveTx.wait();
      console.log("Token approval confirmed");
      return true;
    } else {
      console.log("Sufficient allowance already exists");
      return true;
    }
  } catch (error) {
    console.error(`Error approving token:`, error.message);
    throw error;
  }
};

module.exports = {
  getEvmProvider,
  getEvmWallet,
  getEvmBalance,
  approveToken,
};
