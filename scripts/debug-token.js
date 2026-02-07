const { Connection, PublicKey } = require("@solana/web3.js");
require("dotenv").config();

async function checkToken() {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const mintAddress = "G63pAYWkZd71Jdy83bbdvs6HMQxaYVWy5jsS1hK3pump";
    const ownerAddress = "FXr7YAM4grAYfpb1e8rJ6vWy2mSBHMqYVtB8GUGLHBYB";

    console.log(`Checking mint: ${mintAddress}`);
    try {
        const info = await connection.getAccountInfo(new PublicKey(mintAddress));
        if (info) {
            console.log(`Owner Program: ${info.owner.toString()}`);
            if (info.owner.toString() === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") {
                console.log("Verdict: Standard SPL Token");
            } else if (info.owner.toString() === "TokenzQdBNbLqP5VEhdkscyc9BWFLCcMzg6G6xy1aA") {
                console.log("Verdict: Token-2022");
            } else {
                console.log("Verdict: Unknown Program");
            }
        } else {
            console.log("Mint account not found!");
        }

        console.log(`\nChecking balance for owner: ${ownerAddress}`);
        // Try to find ANY token account for this mint
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(ownerAddress),
            { mint: new PublicKey(mintAddress) }
        );

        console.log(`Found ${tokenAccounts.value.length} token accounts`);
        tokenAccounts.value.forEach((account, i) => {
            console.log(`Account ${i}: ${account.pubkey.toString()}`);
            console.log(`Balance: ${account.account.data.parsed.info.tokenAmount.uiAmount}`);
        });

    } catch (error) {
        console.error("Error:", error);
    }
}

checkToken();
