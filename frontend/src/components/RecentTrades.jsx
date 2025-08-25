// src/RecentTrades.jsx
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

const randomTrade = () => {
  const type = Math.random() > 0.5 ? 'buy' : 'sell';
  const price = 2000 + Math.random() * 500;
  const amount = 0.1 + Math.random() * 2;
  return {
    id: crypto.randomUUID(),
    time: Date.now(),
    type,
    price,
    amount,
    total: price * amount
  };
};

const formatTime = (ts) => new Date(ts).toLocaleTimeString();

const RecentTrades = () => {
  const [trades, setTrades] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    // seed
    setTrades(Array.from({ length: 10 }, () => randomTrade()));

    timerRef.current = setInterval(() => {
      const t = randomTrade();
      setTrades((prev) => [t, ...prev].slice(0, 20));
    }, 2500);

    return () => clearInterval(timerRef.current);
  }, []);

  const totals = trades.reduce((acc, t) => {
    if (t.type === 'buy') acc.buy += t.total;
    else acc.sell += t.total;
    return acc;
  }, { buy: 0, sell: 0 });

  return (
    <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Recent Trades</h3>
        <div className="text-xs text-slate-400">
          <span className="mr-3">Buys ${totals.buy.toFixed(2)}</span>
          <span>Sells ${totals.sell.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs text-slate-400 mb-1">
        <div>Time</div>
        <div>Side</div>
        <div className="text-right">Price</div>
        <div className="text-right">Amount</div>
        <div className="text-right">Total</div>
      </div>

      <div className="h-64 overflow-y-auto space-y-2 pr-1">
        <AnimatePresence initial={false}>
          {trades.map((trade) => (
            <motion.div
              key={trade.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className={`grid grid-cols-5 gap-2 items-center rounded-md p-2 bg-slate-800/40 border border-slate-700/50 ${
                trade.type === 'buy' ? 'border-l-2 border-green-400/30' : 'border-l-2 border-red-400/30'
              }`}
            >
              <div className="text-slate-300 font-mono text-xs">{formatTime(trade.time)}</div>

              <div className="flex items-center space-x-1">
                {trade.type === 'buy' ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                <span className={`text-xs font-medium ${trade.type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                  {trade.type.toUpperCase()}
                </span>
              </div>

              <div className={`text-right font-mono ${trade.type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                ${trade.price.toFixed(2)}
              </div>

              <div className="text-right text-slate-300 font-mono">{trade.amount.toFixed(4)}</div>
              <div className="text-right text-slate-300 font-mono">${trade.total.toFixed(2)}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default RecentTrades;
