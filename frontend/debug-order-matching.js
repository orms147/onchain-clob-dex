import * as dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';
import { debugMatching } from './debug-matching.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const FACTORY_JSON = require('../contracts/out/ClobFactory.sol/ClobFactory.json');

const FACTORY_ABI = FACTORY_JSON.abi;

async function main() {
    // Use same RPC URL logic as debug-matching.js
    const RPC_URL = process.env.VITE_CHAIN_ID === "31337" 
        ? "http://localhost:8545"  // Anvil
        : process.env.VITE_CHAIN_ID === "11155111"
        ? "https://sepolia.infura.io/v3/your-api-key" // Sepolia
        : "http://localhost:8545"; // Default to local

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // Get ClobPair address from Factory
    const factory = new ethers.Contract(process.env.FACTORY_ADDRESS, FACTORY_ABI, provider);
    const allPairs = await factory.getAllPairs();
    if (allPairs.length === 0) {
        console.error('No ClobPairs found in Factory');
        return;
    }
    const CLOB_PAIR_ADDRESS = allPairs[0]; // Get first pair for testing
    
    const debug = await debugMatching(CLOB_PAIR_ADDRESS, provider);

    // 1. Check current price levels
    console.log('\nChecking price levels...');
    const prices = [
        ethers.parseUnits('1.00', 18),
        ethers.parseUnits('2.00', 18),
        ethers.parseUnits('5.00', 18)
    ];

    for (const price of prices) {
        await debug.checkOrderBookState(price);
    }

    // 2. Check SST state across price range
    console.log('\nChecking SST state...');
    await debug.checkSSTState(
        ethers.parseUnits('1.00', 18),
        ethers.parseUnits('5.00', 18)
    );

    // 3. Get pair info
    console.log('\nGetting pair info...');
    const pairInfo = await clobPair.getPairInfo();
    console.log('Pair Info:', {
        baseToken: pairInfo[0],
        quoteToken: pairInfo[1],
        tickSize: ethers.formatUnits(pairInfo[2], 18)
    });

    // 4. Get best bid/ask
    console.log('\nGetting best bid/ask...');
    const bestBid = await clobPair.getBestBid();
    const bestAsk = await clobPair.getBestAsk();
    
    console.log('Best Bid:', {
        exists: bestBid[0],
        price: bestBid[1] ? ethers.formatUnits(bestBid[1], 18) : '0',
        totalBase: bestBid[2].toString()
    });
    
    console.log('Best Ask:', {
        exists: bestAsk[0],
        price: bestAsk[1] ? ethers.formatUnits(bestAsk[1], 18) : '0',
        totalBase: bestAsk[2].toString()
    });

    // 5. Listen for matching events
    console.log('\nListening for matching events...');
    console.log('Place some orders to see debug output...');

    // Keep script running
    process.stdin.resume();
}

main().catch(console.error);
