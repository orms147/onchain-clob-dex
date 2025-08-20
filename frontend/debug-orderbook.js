// DEBUG ORDER BOOK SCRIPT
// Paste this in browser console (F12)

async function debugOrderBook() {
    console.log('🔍 === DEBUGGING ORDER BOOK ===');
    
    try {
        // Get connected wallet info
        if (!window.ethereum) {
            console.log('❌ No MetaMask found');
            return;
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();
        
        if (accounts.length === 0) {
            console.log('❌ No accounts connected');
            return;
        }

        const account = accounts[0].address;
        console.log('👤 Connected Account:', account);

        // Contract addresses - UPDATE THESE WITH YOUR DEPLOYED ADDRESSES
        const ROUTER_ADDRESS = "YOUR_ROUTER_ADDRESS";
        const FACTORY_ADDRESS = "YOUR_FACTORY_ADDRESS";
        
        // Get factory contract
        const factoryABI = [
            "function getClobPair(address baseToken, address quoteToken, uint256 tickSize) view returns (address)"
        ];
        const factory = new ethers.Contract(FACTORY_ADDRESS, factoryABI, provider);

        // Token addresses from your trading form
        const baseToken = "YOUR_BASE_TOKEN";
        const quoteToken = "YOUR_QUOTE_TOKEN";
        const tickSize = "10000000000000000"; // 0.01

        console.log('🪙 Tokens:', { baseToken, quoteToken, tickSize });

        // Get pair address
        const pairAddress = await factory.getClobPair(baseToken, quoteToken, BigInt(tickSize));
        
        if (pairAddress === ethers.ZeroAddress) {
            console.log('❌ No trading pair found');
            return;
        }

        console.log('📍 ClobPair Address:', pairAddress);

        // Create ClobPair contract
        const clobPairABI = [
            "function getBestBid() external view returns (uint256 price, uint64 amount)",
            "function getBestAsk() external view returns (uint256 price, uint64 amount)",
            "function _tickIndex(uint256 price) external view returns (uint256)",
            "event OrderPlaced(bytes32 indexed orderHash, tuple(address maker, address baseToken, address quoteToken, uint64 baseAmount, uint256 price, bool isSellBase, uint256 expiry, uint256 nonce) order, uint64 orderId)",
            "event OrderMatched(bytes32 indexed takerOrderHash, bytes32 indexed makerOrderHash, address indexed taker, address maker, uint64 baseAmount, uint256 price)"
        ];
        
        const clobPair = new ethers.Contract(pairAddress, clobPairABI, provider);

        // Check best prices
        console.log('\n📊 --- ORDER BOOK STATE ---');
        try {
            const [bidPrice, bidAmount] = await clobPair.getBestBid();
            console.log('🟢 Best BID:', {
                price: ethers.formatUnits(bidPrice, 18),
                amount: ethers.formatUnits(bidAmount, 6),
                rawPrice: bidPrice.toString(),
                rawAmount: bidAmount.toString()
            });
        } catch (e) {
            console.log('🟢 Best BID: None available');
        }

        try {
            const [askPrice, askAmount] = await clobPair.getBestAsk();
            console.log('🔴 Best ASK:', {
                price: ethers.formatUnits(askPrice, 18),
                amount: ethers.formatUnits(askAmount, 6),
                rawPrice: askPrice.toString(),
                rawAmount: askAmount.toString()
            });
        } catch (e) {
            console.log('🔴 Best ASK: None available');
        }

        // Get Router contract to check events
        const routerABI = [
            "event OrderPlaced(bytes32 indexed orderHash, address indexed maker, address indexed clobPair, tuple(address maker, address baseToken, address quoteToken, uint64 baseAmount, uint256 price, bool isSellBase, uint256 expiry, uint256 nonce) order)"
        ];
        const router = new ethers.Contract(ROUTER_ADDRESS, routerABI, provider);

        // Get recent OrderPlaced events
        console.log('\n📋 --- RECENT ORDER EVENTS ---');
        const orderFilter = router.filters.OrderPlaced();
        const orderEvents = await router.queryFilter(orderFilter, -1000);
        
        console.log(`📦 Total OrderPlaced events: ${orderEvents.length}`);
        
        // Show last 5 orders
        const recentOrders = orderEvents.slice(-5);
        recentOrders.forEach((event, i) => {
            const order = event.args[3]; // order data
            console.log(`\n📄 Order ${i + 1}:`);
            console.log('  Hash:', event.args[0]);
            console.log('  Maker:', event.args[1]);
            console.log('  Side:', order.isSellBase ? 'SELL' : 'BUY');
            console.log('  Price:', ethers.formatUnits(order.price, 18));
            console.log('  Amount:', ethers.formatUnits(order.baseAmount, 6));
            console.log('  Raw Price:', order.price.toString());
            console.log('  Raw Amount:', order.baseAmount.toString());
        });

        // Check for matching events
        console.log('\n🤝 --- MATCHING EVENTS ---');
        try {
            const matchFilter = clobPair.filters.OrderMatched();
            const matchEvents = await clobPair.queryFilter(matchFilter, -1000);
            console.log(`⚡ Total OrderMatched events: ${matchEvents.length}`);
            
            if (matchEvents.length > 0) {
                matchEvents.slice(-3).forEach((event, i) => {
                    console.log(`Match ${i + 1}:`, {
                        takerHash: event.args[0],
                        makerHash: event.args[1],
                        taker: event.args[2],
                        maker: event.args[3],
                        amount: ethers.formatUnits(event.args[4], 6),
                        price: ethers.formatUnits(event.args[5], 18)
                    });
                });
            } else {
                console.log('❌ No matches found');
            }
        } catch (e) {
            console.log('❌ Error fetching match events:', e.message);
        }

        // Analyze why no matching
        console.log('\n🎯 --- MATCHING ANALYSIS ---');
        
        if (recentOrders.length >= 2) {
            const lastTwo = recentOrders.slice(-2);
            const [order1, order2] = lastTwo.map(e => e.args[3]);
            
            console.log('Comparing last 2 orders:');
            console.log('Order 1:', {
                side: order1.isSellBase ? 'SELL' : 'BUY',
                price: ethers.formatUnits(order1.price, 18),
                maker: lastTwo[0].args[1]
            });
            console.log('Order 2:', {
                side: order2.isSellBase ? 'SELL' : 'BUY', 
                price: ethers.formatUnits(order2.price, 18),
                maker: lastTwo[1].args[1]
            });

            // Check if they should match
            const price1 = Number(ethers.formatUnits(order1.price, 18));
            const price2 = Number(ethers.formatUnits(order2.price, 18));
            const sameMaker = lastTwo[0].args[1] === lastTwo[1].args[1];
            
            console.log('\nMatching Conditions:');
            console.log('✓ Same maker?', sameMaker ? '❌ YES (blocks matching)' : '✅ NO');
            console.log('✓ Opposite sides?', order1.isSellBase !== order2.isSellBase ? '✅ YES' : '❌ NO');
            console.log('✓ Prices cross?', 
                (order1.isSellBase && !order2.isSellBase && price2 >= price1) ||
                (!order1.isSellBase && order2.isSellBase && price1 >= price2) ? '✅ YES' : '❌ NO'
            );
        }

        console.log('\n🎉 Debug complete!');
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    }
}

// Run the debug
debugOrderBook();
