import * as dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const CLOB_JSON = require('../contracts/out/ClobPair.sol/ClobPair.json');
const FACTORY_JSON = require('../contracts/out/ClobFactory.sol/ClobFactory.json');

const CLOB_ABI = CLOB_JSON.abi;
const FACTORY_ABI = FACTORY_JSON.abi;

// Connect to local node
const RPC_URL = process.env.VITE_CHAIN_ID === "31337" 
    ? "http://localhost:8545"  // Anvil
    : process.env.VITE_CHAIN_ID === "11155111"
    ? "https://sepolia.infura.io/v3/your-api-key" // Sepolia 
    : "http://localhost:8545"; // Default to local

const provider = new ethers.JsonRpcProvider(RPC_URL);

async function debugMatching(clobPairAddress, provider) {
    const clobPair = new ethers.Contract(clobPairAddress, CLOB_ABI, provider);

    // Listen for debug events
    clobPair.on('DebugPriceInfo', (price, tickIndex, tickSize, isBid) => {
        console.log('Debug Price Info:', {
            price: ethers.formatUnits(price, 18),
            tickIndex: tickIndex.toString(),
            tickSize: ethers.formatUnits(tickSize, 18),
            isBid
        });
    });

    clobPair.on('DebugMatching', (orderHash, price, remaining, foundMatch, matchPrice) => {
        console.log('Debug Matching:', {
            orderHash,
            price: ethers.formatUnits(price, 18),
            remaining: remaining.toString(),
            foundMatch,
            matchPrice: ethers.formatUnits(matchPrice, 18)
        });
    });

    clobPair.on('DebugOrderBook', (price, bidLength, bidTotalBase, askLength, askTotalBase) => {
        console.log('Debug Order Book:', {
            price: ethers.formatUnits(price, 18),
            bids: {
                length: bidLength.toString(),
                totalBase: bidTotalBase.toString()
            },
            asks: {
                length: askLength.toString(),
                totalBase: askTotalBase.toString()
            }
        });
    });

    // Helper functions to check state
    async function checkOrderBookState(price) {
        const state = await clobPair.getOrderBookState(price);
        console.log('Order Book State:', {
            price: ethers.formatUnits(price, 18),
            bidLength: state.bidLength.toString(),
            bidTotalBase: state.bidTotalBase.toString(),
            askLength: state.askLength.toString(),
            askTotalBase: state.askTotalBase.toString()
        });
    }

    async function checkSSTState(startPrice, endPrice) {
        const state = await clobPair.getSSTState(startPrice, endPrice);
        console.log('SST State:', {
            startPrice: ethers.formatUnits(startPrice, 18),
            endPrice: ethers.formatUnits(endPrice, 18),
            bidValues: state.bidValues.map(v => v.toString()),
            askValues: state.askValues.map(v => v.toString())
        });
    }

    async function checkOrderDetails(orderHash) {
        const details = await clobPair.getOrderDetails(orderHash);
        console.log('Order Details:', {
            exists: details.exists,
            isBid: details.isBid,
            price: ethers.formatUnits(details.price, 18),
            remainingAmount: details.remainingAmount.toString(),
            maker: details.maker
        });
    }

    return {
        checkOrderBookState,
        checkSSTState,
        checkOrderDetails
    };
}

export { debugMatching };
