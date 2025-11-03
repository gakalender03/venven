// sell-nfts.js

// =================================================================
// SCRIPT LOGIC (NO .env FILE, READS FROM ENVIRONMENT VARIABLES)
// =================================================================

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const axios = require('axios');

// --- Constants ---
const OPENSEA_API_BASE_URL = 'https://api.opensea.io/v2';
const CHAIN = 'base';
const CHAIN_ID = 8453;
const SEAPORT_CONTRACT_ADDRESS = '0x00000000000001ad428e4906ae43d8f9852d0dd6';

// --- Configuration from Environment Variables (Provided by GitHub Secrets) ---
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY;
const RPC_URL = process.env.RPC_URL;
const TARGET_CONTRACT_ADDRESS = process.env.TARGET_CONTRACT_ADDRESS;
const LISTING_PRICE_IN_ETH = process.env.LISTING_PRICE_IN_ETH;
const LISTING_DURATION_MINUTES = process.env.LISTING_DURATION_MINUTES;

// --- Process Wallets and Keys from the environment variables ---
const WALLETS = process.env.WALLETS.split("\n").map(line => line.trim()).filter(Boolean);
const PRIVATE_KEYS = process.env.PRIVATE_KEYS.split("\n").map(line => line.trim()).filter(Boolean);

// --- Validation ---
if (!OPENSEA_API_KEY || !RPC_URL || !TARGET_CONTRACT_ADDRESS || !LISTING_PRICE_IN_ETH || !LISTING_DURATION_MINUTES) {
    console.error('ERROR: Please ensure all required environment variables are set in your GitHub Secrets.');
    process.exit(1);
}

if (WALLETS.length !== PRIVATE_KEYS.length) {
    console.error(`ERROR: The number of wallet addresses (${WALLETS.length}) does not match the number of private keys (${PRIVATE_KEYS.length}).`);
    process.exit(1);
}

// --- Logging Function ---
function logToFile(message) {
    const logFilePath = path.join(__dirname, 'listing_log.txt');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFilePath, `[${timestamp}] ${message}\n`);
}

// --- Ethers Setup ---
function getWallet(privateKey) {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    return new ethers.Wallet(privateKey, provider);
}

// --- Main Listing Function ---
async function listNFT(wallet, nft, priceInEth) {
    const logMessage = `Attempting to list ${nft.name || 'NFT'} (Token ID: ${nft.identifier}) from wallet ${wallet.address} for ${priceInEth} ETH`;
    console.log(`[START] ${logMessage}`);
    logToFile(`[START] ${logMessage}`);

    try {
        const priceInWei = ethers.utils.parseEther(priceInEth);
        const now = Math.floor(Date.now() / 1000);
        const durationInSeconds = parseInt(LISTING_DURATION_MINUTES) * 60;

        // --- Seaport Order Components ---
        const domain = {
            name: 'Seaport',
            version: '1.5',
            chainId: CHAIN_ID,
            verifyingContract: SEAPORT_CONTRACT_ADDRESS,
        };

        const types = {
            OrderComponents: [
                { name: 'offerer', type: 'address' },
                { name: 'zone', type: 'address' },
                { name: 'offer', type: 'OfferItem[]' },
                { name: 'consideration', type: 'ConsiderationItem[]' },
                { name: 'orderType', type: 'uint8' },
                { name: 'startTime', type: 'uint256' },
                { name: 'endTime', type: 'uint256' },
                { name: 'zoneHash', type: 'bytes32' },
                { name: 'salt', type: 'uint256' },
                { name: 'conduitKey', type: 'bytes32' },
                { name: 'counter', type: 'uint256' },
            ],
            OfferItem: [
                { name: 'itemType', type: 'uint8' },
                { name: 'token', type: 'address' },
                { name: 'identifierOrCriteria', type: 'uint256' },
                { name: 'startAmount', type: 'uint256' },
                { name: 'endAmount', type: 'uint256' },
            ],
            ConsiderationItem: [
                { name: 'itemType', type: 'uint8' },
                { name: 'token', type: 'address' },
                { name: 'identifierOrCriteria', type: 'uint256' },
                { name: 'startAmount', type: 'uint256' },
                { name: 'endAmount', type: 'uint256' },
                { name: 'recipient', type: 'address' },
            ],
        };

        const offer = [{
            itemType: 2, // ERC721
            token: nft.contract,
            identifierOrCriteria: nft.identifier,
            startAmount: '1',
            endAmount: '1',
        }];

        const consideration = [{
            itemType: 0, // Native ETH
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: '0',
            startAmount: priceInWei.toString(),
            endAmount: priceInWei.toString(),
            recipient: wallet.address,
        }];

        const orderComponents = {
            offerer: wallet.address,
            zone: '0x0000000000000000000000000000000000000000',
            offer: offer,
            consideration: consideration,
            orderType: 0, // FULL_OPEN
            startTime: now,
            endTime: now + durationInSeconds,
            zoneHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
            salt: ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString(),
            conduitKey: '0x0000007b02230091a7ed01230072f706a00400000000000000000000000000',
            counter: '0',
        };
        
        const signature = await wallet._signTypedData(domain, types, orderComponents);

        const payload = {
            parameters: {
                ...orderComponents,
                signature: signature,
            },
            protocol_address: SEAPORT_CONTRACT_ADDRESS,
        };

        const response = await axios.post(`${OPENSEA_API_BASE_URL}/listings`, payload, {
            headers: { 'X-API-KEY': OPENSEA_API_KEY, 'Content-Type': 'application/json' }
        });

        const successMessage = `SUCCESS: NFT "${nft.name || 'NFT'}" listed! Link: https://opensea.io/assets/base/${nft.contract}/${nft.identifier}`;
        console.log(`[SUCCESS] ${successMessage}`);
        logToFile(`[SUCCESS] ${successMessage}`);
        return true;

    } catch (error) {
        const errorMessage = `FAILED: Error listing NFT ${nft.name || 'NFT'} (ID: ${nft.identifier}). Reason: ${error.response?.data?.message || error.message}`;
        console.error(`[FAILED] ${errorMessage}`);
        logToFile(`[FAILED] ${errorMessage}`);
        if (error.response) {
            logToFile(`[FAILED] Error Details: ${JSON.stringify(error.response.data, null, 2)}`);
        }
        return false;
    }
}

// --- Main Execution Function ---
async function main() {
    const startMessage = `--- Starting NFT listing process for ${WALLETS.length} wallets. ---`;
    console.log(startMessage);
    logToFile(startMessage);

    for (let i = 0; i < WALLETS.length; i++) {
        const walletAddress = WALLETS[i];
        const privateKey = PRIVATE_KEYS[i];
        const walletHeader = `\n=========================================\nProcessing wallet ${i + 1}/${WALLETS.length}: ${walletAddress}\n=========================================`;
        console.log(walletHeader);
        logToFile(walletHeader);

        const wallet = getWallet(privateKey);
        try {
            const { data } = await axios.get(`${OPENSEA_API_BASE_URL}/chain/${CHAIN}/account/${walletAddress}/nfts`, {
                headers: { 'X-API-KEY': OPENSEA_API_KEY }
            });
            const targetNfts = data.nfts.filter(nft => nft.contract.toLowerCase() === TARGET_CONTRACT_ADDRESS.toLowerCase());
            if (targetNfts.length === 0) {
                console.log(`No NFTs from the target contract found in this wallet.`);
                logToFile(`No NFTs from the target contract found.`);
                continue;
            }
            console.log(`Found ${targetNfts.length} NFTs from the target contract. Starting listing process...`);
            logToFile(`Found ${targetNfts.length} NFTs from the target contract.`);
            for (const nft of targetNfts) {
                await listNFT(wallet, nft, LISTING_PRICE_IN_ETH);
                await new Promise(resolve => setTimeout(resolve, 2000)); 
            }
        } catch (error) {
            const fetchError = `Failed to fetch NFTs from wallet ${walletAddress}. Reason: ${error.response?.data?.message || error.message}`;
            console.error(fetchError);
            logToFile(fetchError);
        }
    }
    const endMessage = '\n--- Process finished. Check listing_log.txt for a full report. ---';
    console.log(endMessage);
    logToFile(endMessage);
}

main().catch(error => {
    console.error('An unexpected error occurred:', error);
    logToFile(`FATAL ERROR: ${error.message}`);
    process.exit(1);
});
