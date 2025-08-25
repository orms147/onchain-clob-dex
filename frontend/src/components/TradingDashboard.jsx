// src/components/TradingDashboard.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import WalletConnection from '@/components/WalletConnection';
import MarketStats from '@/components/MarketStats';
import OrderBook from '@/components/OrderBook';
import TradingForm from '@/components/TradingForm';
import UserOrders from '@/components/UserOrders';
import RecentTrades from '@/components/RecentTrades';
import { useWeb3 } from '@/hooks/useWeb3';
import { useContracts } from '@/hooks/useContracts';

const TradingDashboard = () => {
  const [selectedPair, setSelectedPair] = useState('');  // clob pair address
  const [pairList, setPairList] = useState([]);          // all pairs from factory
  const [currentPrice, setCurrentPrice] = useState(2500);
  const [priceChange, setPriceChange] = useState(0);

  const { signer } = useWeb3();
  const { getAllPairs } = useContracts(signer);

  useEffect(() => {
    (async () => {
      try {
        const list = await getAllPairs();
        setPairList(list || []);
        if (!selectedPair && list?.length) setSelectedPair(list[0]);
      } catch (e) {
        console.error('load pairs failed:', e);
        setPairList([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signer]);

  return (
    <div className="min-h-screen p-4 flex flex-col space-y-4">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-effect rounded-xl p-4 flex-shrink-0"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Activity className="h-8 w-8 text-green-400" />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                DEX Order Book
              </h1>
            </div>

            {/* Pair selector */}
            <div className="flex items-center space-x-2">
              <span className="text-slate-400 text-sm">Pair</span>
              <select
                className="bg-slate-800/50 rounded px-2 py-1 text-sm text-white"
                value={selectedPair}
                onChange={(e) => setSelectedPair(e.target.value)}
              >
                {pairList.length === 0 && <option value="">No pairs</option>}
                {pairList.map((p) => (
                  <option key={p} value={p}>
                    {p.slice(0, 6)}...{p.slice(-4)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                ${currentPrice.toFixed(2)}
              </div>
              <div className={`flex items-center justify-end text-sm ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priceChange >= 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </div>
            </div>
            <WalletConnection />
          </div>
        </div>
      </motion.header>

      {/* Market Stats */}
      <div className="flex-shrink-0">
        <MarketStats currentPrice={currentPrice} />
      </div>

      {/* Main */}
      <main className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        {/* Order Book */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-1 min-h-0"
        >
          <OrderBook pairAddress={selectedPair} />
        </motion.div>

        {/* Trading Form - now tied to selectedPair */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-1 min-h-0"
        >
          <TradingForm pairAddress={selectedPair} />
        </motion.div>

        {/* User Orders */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-1 min-h-0"
        >
          <UserOrders pairAddress={selectedPair} />
        </motion.div>
      </main>

      {/* Recent Trades */}
      <motion.footer
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex-shrink-0"
      >
        <RecentTrades />
      </motion.footer>
    </div>
  );
};

export default TradingDashboard;
