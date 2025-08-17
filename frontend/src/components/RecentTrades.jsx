import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, TrendingUp, TrendingDown, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const RecentTrades = ({ selectedPair }) => {
  const [trades, setTrades] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    // Generate mock trade data
    const generateTrades = () => {
      const newTrades = [];
      for (let i = 0; i < 20; i++) {
        const isBuy = Math.random() > 0.5;
        const price = 2450 + (Math.random() - 0.5) * 100;
        const amount = Math.random() * 5 + 0.1;
        const time = Date.now() - i * 30000;
        
        newTrades.push({
          id: Math.random().toString(36).substr(2, 9),
          type: isBuy ? 'buy' : 'sell',
          price: price,
          amount: amount,
          total: price * amount,
          time: time
        });
      }
      return newTrades;
    };

    setTrades(generateTrades());

    // Simulate real-time trades
    const interval = setInterval(() => {
      const newTrade = {
        id: Math.random().toString(36).substr(2, 9),
        type: Math.random() > 0.5 ? 'buy' : 'sell',
        price: 2450 + (Math.random() - 0.5) * 100,
        amount: Math.random() * 5 + 0.1,
        time: Date.now()
      };
      newTrade.total = newTrade.price * newTrade.amount;

      setTrades(prev => [newTrade, ...prev.slice(0, 19)]);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedPair]);

  const filteredTrades = trades.filter(trade => {
    if (filter === 'all') return true;
    return trade.type === filter;
  });

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="glass-effect rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Clock className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Recent Trades</h2>
          <span className="text-sm text-slate-400">({selectedPair})</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1 bg-slate-800/50 rounded-lg p-1">
            {['all', 'buy', 'sell'].map((filterType) => (
              <button
                key={filterType}
                onClick={() => setFilter(filterType)}
                className={`px-3 py-1 rounded text-xs font-medium transition-all capitalize ${
                  filter === filterType
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {filterType}
              </button>
            ))}
          </div>
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => toast({ title: "🚧 Advanced filters aren't implemented yet—but don't worry! You can request them in your next prompt! 🚀" })}
            className="border-slate-600 hover:bg-slate-700"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-5 gap-4 text-xs text-slate-400 mb-3 px-2">
        <div>Time</div>
        <div>Type</div>
        <div className="text-right">Price</div>
        <div className="text-right">Amount</div>
        <div className="text-right">Total</div>
      </div>

      {/* Trades List */}
      <div className="max-h-64 overflow-y-auto space-y-1">
        <AnimatePresence>
          {filteredTrades.map((trade, index) => (
            <motion.div
              key={trade.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ delay: index * 0.02 }}
              className={`grid grid-cols-5 gap-4 py-2 px-2 rounded-lg text-sm hover:bg-slate-800/30 transition-all ${
                trade.type === 'buy' ? 'border-l-2 border-green-400/30' : 'border-l-2 border-red-400/30'
              }`}
            >
              <div className="text-slate-300 font-mono text-xs">
                {formatTime(trade.time)}
              </div>
              
              <div className="flex items-center space-x-1">
                {trade.type === 'buy' ? (
                  <TrendingUp className="h-3 w-3 text-green-400" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-400" />
                )}
                <span className={`text-xs font-medium ${
                  trade.type === 'buy' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {trade.type.toUpperCase()}
                </span>
              </div>
              
              <div className={`text-right font-mono ${
                trade.type === 'buy' ? 'text-green-400' : 'text-red-400'
              }`}>
                ${trade.price.toFixed(2)}
              </div>
              
              <div className="text-right text-slate-300 font-mono">
                {trade.amount.toFixed(4)}
              </div>
              
              <div className="text-right text-slate-300 font-mono">
                ${trade.total.toFixed(2)}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Summary */}
      <div className="mt-4 pt-4 border-t border-slate-700">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="text-slate-400">Total Trades</div>
            <div className="text-white font-semibold">{trades.length}</div>
          </div>
          <div className="text-center">
            <div className="text-slate-400">Buy Orders</div>
            <div className="text-green-400 font-semibold">
              {trades.filter(t => t.type === 'buy').length}
            </div>
          </div>
          <div className="text-center">
            <div className="text-slate-400">Sell Orders</div>
            <div className="text-red-400 font-semibold">
              {trades.filter(t => t.type === 'sell').length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecentTrades;