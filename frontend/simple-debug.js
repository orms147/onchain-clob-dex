// SIMPLE DEBUG SCRIPT - Safe for MetaMask
// Copy và paste vào browser console (F12)

console.clear();
console.log('🔍 === SIMPLE ORDER BOOK DEBUG ===');

async function simpleDebug() {
    try {
        // Check if MetaMask is available
        if (!window.ethereum) {
            console.log('❌ MetaMask not found');
            return;
        }

        console.log('✅ MetaMask detected');

        // Get accounts without triggering connection
        let accounts;
        try {
            accounts = await window.ethereum.request({ method: 'eth_accounts' });
        } catch (e) {
            console.log('❌ Cannot get accounts:', e.message);
            return;
        }

        if (accounts.length === 0) {
            console.log('❌ No accounts connected');
            return;
        }

        console.log('👤 Connected Account:', accounts[0]);

        // Create provider with error handling
        let provider;
        try {
            provider = new ethers.BrowserProvider(window.ethereum);
            console.log('✅ Provider created');
        } catch (e) {
            console.log('❌ Provider creation failed:', e.message);
            return;
        }

        // Your contract addresses (UPDATE THESE)
        const baseToken = "0x33060d3fdd66A5B713f483d689A2C42d";
        const quoteToken = "0xf46c8c9774aD593fb61a85636b02f337";
        const tickSize = "1000000000000000000";
        
        console.log('🪙 Token Setup:');
        console.log('  Base:', baseToken);
        console.log('  Quote:', quoteToken);
        console.log('  Tick Size:', tickSize);

        // Try to get factory address from global scope
        let factoryAddress = null;
        let routerAddress = null;

        // Check if contracts are available in window
        if (typeof window.contracts !== 'undefined') {
            factoryAddress = window.contracts.factory?.target;
            routerAddress = window.contracts.router?.target;
        }

        if (!factoryAddress) {
            console.log('❌ Factory address not found in window.contracts');
            console.log('💡 Please fill in factory address manually:');
            console.log('const factoryAddress = "YOUR_FACTORY_ADDRESS";');
            return;
        }

        console.log('🏭 Factory Address:', factoryAddress);
        console.log('🚀 Router Address:', routerAddress);

        // Simple Factory ABI - only what we need
        const factoryABI = [
            "function getClobPair(address,address,uint256) view returns (address)"
        ];

        let factory;
        try {
            factory = new ethers.Contract(factoryAddress, factoryABI, provider);
            console.log('✅ Factory contract created');
        } catch (e) {
            console.log('❌ Factory contract creation failed:', e.message);
            return;
        }

        // Get pair address with error handling
        let pairAddress;
        try {
            pairAddress = await factory.getClobPair(baseToken, quoteToken, BigInt(tickSize));
            console.log('📍 Pair Address:', pairAddress);
        } catch (e) {
            console.log('❌ getClobPair failed:', e.message);
            console.log('💡 This might be the RPC error - contract call failed');
            return;
        }

        if (pairAddress === ethers.ZeroAddress) {
            console.log('❌ Pair does not exist');
            return;
        }

        console.log('✅ Pair exists:', pairAddress);

        // Simple ClobPair ABI
        const pairABI = [
            "function getBestBid() view returns (bool,uint256,uint64)",
            "function getBestAsk() view returns (bool,uint256,uint64)"
        ];

        let clobPair;
        try {
            clobPair = new ethers.Contract(pairAddress, pairABI, provider);
            console.log('✅ ClobPair contract created');
        } catch (e) {
            console.log('❌ ClobPair contract creation failed:', e.message);
            return;
        }

        // Check order book state
        console.log('\n📊 --- ORDER BOOK STATE ---');
        
        try {
            const bestBid = await clobPair.getBestBid();
            console.log('🟢 Best BID:', {
                exists: bestBid[0],
                price: ethers.formatUnits(bestBid[1], 18),
                amount: ethers.formatUnits(bestBid[2], 6),
                raw: [bestBid[0], bestBid[1].toString(), bestBid[2].toString()]
            });
        } catch (e) {
            console.log('🟢 Best BID: Error or None -', e.message);
        }

        try {
            const bestAsk = await clobPair.getBestAsk();
            console.log('🔴 Best ASK:', {
                exists: bestAsk[0],
                price: ethers.formatUnits(bestAsk[1], 18),
                amount: ethers.formatUnits(bestAsk[2], 6),
                raw: [bestAsk[0], bestAsk[1].toString(), bestAsk[2].toString()]
            });
        } catch (e) {
            console.log('🔴 Best ASK: Error or None -', e.message);
        }

        // Try to get recent events (simplified)
        if (routerAddress) {
            console.log('\n📋 --- CHECKING RECENT EVENTS ---');
            
            const routerABI = [
                "event OrderPlaced(bytes32 indexed orderHash, address indexed maker, address indexed clobPair, tuple(address,address,address,uint64,uint256,bool,uint256,uint256))"
            ];

            try {
                const router = new ethers.Contract(routerAddress, routerABI, provider);
                
                // Get latest block number first
                const currentBlock = await provider.getBlockNumber();
                console.log('📦 Current block:', currentBlock);
                
                // Query recent events (last 50 blocks to avoid RPC limits)
                const fromBlock = Math.max(0, currentBlock - 50);
                
                const orderFilter = router.filters.OrderPlaced(null, null, pairAddress);
                const events = await router.queryFilter(orderFilter, fromBlock);
                
                console.log(`📋 Found ${events.length} orders in last 50 blocks`);
                
                events.forEach((event, i) => {
                    const order = event.args[3];
                    console.log(`Order ${i + 1}:`, {
                        maker: event.args[1],
                        side: order[5] ? 'SELL' : 'BUY',
                        price: ethers.formatUnits(order[4], 18),
                        amount: ethers.formatUnits(order[3], 6)
                    });
                });

            } catch (e) {
                console.log('❌ Event query failed:', e.message);
                console.log('💡 This is likely due to RPC rate limits');
            }
        }

        console.log('\n✅ === DEBUG COMPLETE ===');
        console.log('💡 If you see RPC errors, try:');
        console.log('   1. Refresh page and try again');
        console.log('   2. Switch MetaMask network and back');
        console.log('   3. Check if contracts are deployed correctly');

    } catch (error) {
        console.error('❌ Debug script failed:', error);
        console.log('💡 Try refreshing page and running again');
    }
}

// Run the debug
simpleDebug();
