import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import OrderBook from '@/components/OrderBook';
import TradingForm from '@/components/TradingForm';
import PriceChart from '@/components/PriceChart';
import MarketStats from '@/components/MarketStats';
import RecentTrades from '@/components/RecentTrades';
import WalletConnection from '@/components/WalletConnection';
import UserOrders from '@/components/UserOrders';
import { useWeb3 } from '../hooks/useWeb3';

const TradingDashboard = () => {
  const [selectedPair, setSelectedPair] = useState('ETH/USDC');
  const [currentPrice, setCurrentPrice] = useState(2456.78);
  const [priceChange, setPriceChange] = useState(2.34);
  const { isConnected } = useWeb3();

  const tradingPairs = [
    { symbol: 'ETH/USDC', price: 2456.78, change: 2.34 },
    { symbol: 'BTC/USDC', price: 43250.12, change: -1.23 },
    { symbol: 'LINK/USDC', price: 14.56, change: 5.67 },
    { symbol: 'UNI/USDC', price: 6.78, change: -0.89 }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      const randomChange = (Math.random() - 0.5) * 10;
      setCurrentPrice(prev => Math.max(0, prev + randomChange));
      setPriceChange(randomChange);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handlePairSelect = (pair) => {
    setSelectedPair(pair.symbol);
    setCurrentPrice(pair.price);
    setPriceChange(pair.change);
  };

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
            
            <div className="flex items-center space-x-2">
              <select 
                value={selectedPair}
                onChange={(e) => {
                  const pair = tradingPairs.find(p => p.symbol === e.target.value);
                  if (pair) handlePairSelect(pair);
                }}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                {tradingPairs.map(pair => (
                  <option key={pair.symbol} value={pair.symbol}>
                    {pair.symbol}
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
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => toast({ title: "🚧 Tính năng cài đặt chưa được triển khai—nhưng đừng lo! Bạn có thể yêu cầu nó trong lần nhắc tiếp theo! 🚀" })}
              className="border-slate-600 hover:bg-slate-700"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.header>

      {/* Market Stats */}
      <div className="flex-shrink-0">
        <MarketStats selectedPair={selectedPair} currentPrice={currentPrice} />
      </div>

      {/* Main Trading Interface */}
      <main className="flex-grow grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-0">
        {/* Order Book */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-1 min-h-0"
        >
          <OrderBook currentPrice={currentPrice} />
        </motion.div>

        {/* Price Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 min-h-0"
        >
          <PriceChart selectedPair={selectedPair} currentPrice={currentPrice} />
        </motion.div>

        {/* Trading Form */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-1 min-h-0"
        >
          <TradingForm
            selectedPair={selectedPair}
            currentPrice={currentPrice}
          />
        </motion.div>

        {/* User Orders */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-1 min-h-0"
        >
          <UserOrders />
        </motion.div>
      </main>

      {/* Recent Trades */}
      <motion.footer
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex-shrink-0"
      >
        <RecentTrades selectedPair={selectedPair} />
      </motion.footer>
    </div>
  );
};

export default TradingDashboard;