import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWeb3 } from '../hooks/useWeb3';
import { useContracts } from '../hooks/useContracts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { ethers } from 'ethers';

const OrderBook = ({ currentPrice }) => {
  const [buyOrders, setBuyOrders] = useState([]);
  const [sellOrders, setSellOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const { signer, provider } = useWeb3();
  const { contracts } = useContracts(signer);

  useEffect(() => {
    const fetchOrderBookData = async () => {
      if (!contracts || !provider) {
        // If no contracts available, show empty order book
        setBuyOrders([]);
        setSellOrders([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log('🔄 Fetching OrderBook data...');

        // Get all OrderPlaced events to build order book
        const filter = contracts.router.filters.OrderPlaced();
        const events = await contracts.router.queryFilter(filter, -1000); // Last 1000 blocks
        
        console.log('📋 Found total OrderPlaced events:', events.length);
        
        // Process events to build order book
        const buyOrdersTemp = [];
        const sellOrdersTemp = [];
        
        events.forEach((event) => {
          const args = event.args;
          const orderData = args[3]; // Order struct
          
          if (!orderData) return;
          
          const baseAmount = orderData.baseAmount ? 
            parseFloat(ethers.formatUnits(orderData.baseAmount, 6)) : 0;
          const price = orderData.price ? 
            parseFloat(ethers.formatUnits(orderData.price, 18)) : 0;
          
          const order = {
            id: args[0],
            maker: args[1],
            baseAmount: baseAmount,
            price: price,
            amount: baseAmount, // For OrderRow component compatibility
            total: baseAmount * price, // Calculate total value
            side: orderData.isSellBase ? 'sell' : 'buy'
          };
          
          if (order.side === 'buy') {
            buyOrdersTemp.push(order);
          } else {
            sellOrdersTemp.push(order);
          }
        });
        
        // Professional OrderBook Layout (like Binance/Coinbase):
        // 
        // ╔═══════ SELL ORDERS (ASK) ═══════╗
        // ║  $2600  <- Highest Ask (top)     ║  
        // ║  $2550                           ║
        // ║  $2510  <- Lowest Ask (bottom)   ║ 
        // ╠═══════ CURRENT PRICE ═══════════╣
        // ║  $2500  <- Spread                ║
        // ╠═══════ BUY ORDERS (BID) ════════╣  
        // ║  $2490  <- Highest Bid (top)     ║
        // ║  $2450                           ║
        // ║  $2400  <- Lowest Bid (bottom)   ║
        // ╚══════════════════════════════════╝
        //
        sellOrdersTemp.sort((a, b) => b.price - a.price); // DESC: Highest ask at top
        buyOrdersTemp.sort((a, b) => b.price - a.price);  // DESC: Highest bid at top
        
        setBuyOrders(buyOrdersTemp.slice(0, 10)); // Show top 10
        setSellOrders(sellOrdersTemp.slice(0, 10)); // Show top 10
        
        console.log('✅ OrderBook updated:', {
          buyOrders: buyOrdersTemp.length,
          sellOrders: sellOrdersTemp.length
        });

      } catch (error) {
        console.error('Error fetching order book data:', error);
        setBuyOrders([]);
        setSellOrders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderBookData();
  }, [contracts, provider, currentPrice]);

  const OrderRow = ({ order, type, index }) => (
    <motion.div
      initial={{ opacity: 0, x: type === 'buy' ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      className={`order-book-item grid grid-cols-3 gap-1 py-0.5 px-2 text-xs cursor-pointer hover:bg-slate-700/20 ${
        type === 'buy' ? 'buy-order' : 'sell-order'
      }`}
    >
      <div className={`font-mono ${type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
        {(order.price || 0).toFixed(2)}
      </div>
      <div className="text-slate-300 text-right">
        {(order.amount || 0).toFixed(4)}
      </div>
      <div className="text-slate-400 text-right">
        {(order.total || 0).toFixed(2)}
      </div>
    </motion.div>
  );

  return (
    <div className="glass-effect rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-white">Order Book</h2>
        <div className="flex items-center space-x-3 text-xs text-slate-500">
          <span>Price</span>
          <span>Amount</span>
          <span>Total</span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {/* Sell Orders - ASK (Higher prices at top, farthest from spread) */}
        <div className="h-1/2 overflow-y-auto border-b border-slate-700/50">
          <div className="grid grid-cols-3 gap-1 text-xs text-slate-500 mb-1 px-2 sticky top-0 bg-slate-900/80 backdrop-blur-sm py-1">
            <div className="text-red-400 font-medium">ASK Price</div>
            <div className="text-right">Amount</div>
            <div className="text-right">Total</div>
          </div>
          
          <AnimatePresence>
            {loading ? (
              <div className="text-center text-slate-400 py-4">
                Đang tải...
              </div>
            ) : sellOrders.length > 0 ? (
              sellOrders.slice(0, 10).map((order, index) => (
                <OrderRow key={order.id} order={order} type="sell" index={index} />
              ))
            ) : (
              <div className="text-center text-slate-400 py-4">
                Không có lệnh bán
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Current Price */}
        <motion.div
          animate={{ 
            boxShadow: currentPrice > 2450 ? '0 0 15px rgba(34, 197, 94, 0.3)' : '0 0 15px rgba(239, 68, 68, 0.3)'
          }}
          className="my-2 p-2 rounded-lg bg-slate-800/50 border border-slate-600"
        >
          <div className="flex items-center justify-center space-x-2">
            {currentPrice > 2450 ? (
              <TrendingUp className="h-4 w-4 text-green-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-400" />
            )}
            <span className={`font-mono text-lg font-bold ${
              currentPrice > 2450 ? 'text-green-400' : 'text-red-400'
            }`}>
              ${currentPrice.toFixed(2)}
            </span>
          </div>
          <div className="text-center text-xs text-slate-500">
            Current Price
          </div>
        </motion.div>

        {/* Buy Orders - BID (Higher prices at top, closest to spread) */}
        <div className="h-1/2 overflow-y-auto">
          <div className="grid grid-cols-3 gap-1 text-xs text-slate-500 mb-1 px-2 sticky top-0 bg-slate-900/80 backdrop-blur-sm py-1">
            <div className="text-green-400 font-medium">BID Price</div>
            <div className="text-right">Amount</div>
            <div className="text-right">Total</div>
          </div>
          <AnimatePresence>
            {loading ? (
              <div className="text-center text-slate-400 py-4">
                Đang tải...
              </div>
            ) : buyOrders.length > 0 ? (
              buyOrders.slice(0, 10).map((order, index) => (
                <OrderRow key={order.id} order={order} type="buy" index={index} />
              ))
            ) : (
              <div className="text-center text-slate-400 py-4">
                Không có lệnh mua
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default OrderBook;