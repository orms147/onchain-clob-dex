// QUICK DEBUG - Paste this in console NOW
console.clear();
console.log('🔍 === QUICK DEBUG ===');

// Your current setup
const baseToken = "0x33060d3fdd66A5B713f483d689A2C42d";
const quoteToken = "0xf46c8c9774aD593fb61a85636b02f337";  
const tickSize = "1000000000000000000";

async function quickDebug() {
    try {
        if (!window.ethereum) {
            console.log('❌ No MetaMask');
            return;
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();
        
        if (accounts.length === 0) {
            console.log('❌ No accounts');
            return;
        }

        console.log('👤 Current Account:', accounts[0].address);

        // Try to get contracts from window (if available)
        if (typeof contracts !== 'undefined' && contracts.factory) {
            console.log('📍 Using existing contracts...');
            
            // Get pair address  
            const pairAddress = await contracts.factory.getClobPair(baseToken, quoteToken, BigInt(tickSize));
            console.log('🏭 Pair Address:', pairAddress);

            if (pairAddress === ethers.ZeroAddress) {
                console.log('❌ No pair found');
                return;
            }

            // Get recent orders from Router
            const orderFilter = contracts.router.filters.OrderPlaced();
            const orders = await contracts.router.queryFilter(orderFilter, -100);
            
            console.log(`📦 Found ${orders.length} total orders`);
            
            // Filter orders for this pair
            const pairOrders = orders.filter(event => event.args[2].toLowerCase() === pairAddress.toLowerCase());
            console.log(`📋 Orders for this pair: ${pairOrders.length}`);
            
            // Show last 3 orders
            pairOrders.slice(-3).forEach((event, i) => {
                const order = event.args[3];
                console.log(`📄 Order ${i + 1}:`);
                console.log('  Maker:', event.args[1]);
                console.log('  Side:', order.isSellBase ? 'SELL' : 'BUY');
                console.log('  Price:', ethers.formatUnits(order.price, 18));
                console.log('  Amount:', ethers.formatUnits(order.baseAmount, 6));
            });

            // Check if last 2 should match
            if (pairOrders.length >= 2) {
                const last2 = pairOrders.slice(-2);
                const [order1, order2] = [last2[0].args[3], last2[1].args[3]];
                const [maker1, maker2] = [last2[0].args[1], last2[1].args[1]];
                
                console.log('\n🎯 MATCHING CHECK:');
                console.log('Same maker?', maker1 === maker2 ? '❌ YES' : '✅ NO');
                console.log('Opposite sides?', order1.isSellBase !== order2.isSellBase ? '✅ YES' : '❌ NO');
                
                const price1 = Number(ethers.formatUnits(order1.price, 18));
                const price2 = Number(ethers.formatUnits(order2.price, 18)); 
                
                const shouldMatch = (order1.isSellBase && !order2.isSellBase && price2 >= price1) ||
                                  (!order1.isSellBase && order2.isSellBase && price1 >= price2);
                                  
                console.log('Prices cross?', shouldMatch ? '✅ YES' : '❌ NO');
                console.log(`Price 1: ${price1}, Price 2: ${price2}`);
                
                if (shouldMatch && maker1 !== maker2) {
                    console.log('🔥 THESE SHOULD MATCH!');
                } else if (maker1 === maker2) {
                    console.log('⭕ Same maker - self-matching prevented');
                } else {
                    console.log('⭕ Prices don\'t cross');
                }
            }

        } else {
            console.log('❌ Contracts not available in window scope');
            console.log('💡 Try clicking the Debug button in the app instead');
        }
        
    } catch (error) {
        console.error('❌ Quick debug failed:', error);
    }
}

quickDebug();
