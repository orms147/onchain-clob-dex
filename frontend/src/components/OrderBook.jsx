import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWeb3 } from '../hooks/useWeb3';
import { useContracts } from '../hooks/useContracts';
import { TrendingUp, TrendingDown } from 'lucide-react';

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

        // For now, we'll show empty order book since we need to implement
        // order book data fetching from contract events or state
        // This would require listening to OrderPlaced events and maintaining
        // the order book state

        setBuyOrders([]);
        setSellOrders([]);

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
      className={`order-book-item grid grid-cols-3 gap-2 py-1 px-2 text-xs cursor-pointer ${
        type === 'buy' ? 'buy-order hover:bg-green-500/10' : 'sell-order hover:bg-red-500/10'
      }`}
    >
      <div className={`font-mono ${type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
        {order.price.toFixed(2)}
      </div>
      <div className="text-slate-300 text-right">
        {order.amount.toFixed(4)}
      </div>
      <div className="text-slate-400 text-right">
        {order.total.toFixed(2)}
      </div>
    </motion.div>
  );

  return (
    <div className="glass-effect rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Order Book</h2>
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <span>Price</span>
          <span>Amount</span>
          <span>Total</span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {/* Sell Orders */}
        <div className="h-1/2 overflow-y-auto">
          <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 mb-2 px-2">
            <div>Price (USDC)</div>
            <div className="text-right">Amount (ETH)</div>
            <div className="text-right">Total</div>
          </div>
          
          <AnimatePresence>
            {loading ? (
              <div className="text-center text-slate-400 py-4">
                Đang tải...
              </div>
            ) : sellOrders.length > 0 ? (
              sellOrders.slice(0, 10).reverse().map((order, index) => (
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
            boxShadow: currentPrice > 2450 ? '0 0 20px rgba(34, 197, 94, 0.5)' : '0 0 20px rgba(239, 68, 68, 0.5)'
          }}
          className="my-4 p-3 rounded-lg bg-slate-800/50 border border-slate-600"
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
          <div className="text-center text-xs text-slate-400 mt-1">
            Current Price
          </div>
        </motion.div>

        {/* Buy Orders */}
        <div className="h-1/2 overflow-y-auto">
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