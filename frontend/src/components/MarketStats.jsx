import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity, DollarSign, BarChart3, Users } from 'lucide-react';

const MarketStats = ({ selectedPair, currentPrice }) => {
  const stats = [
    {
      label: '24h Volume',
      value: '$12.4M',
      change: '+5.2%',
      positive: true,
      icon: BarChart3
    },
    {
      label: '24h High',
      value: `$${(currentPrice * 1.05).toFixed(2)}`,
      change: '+2.1%',
      positive: true,
      icon: TrendingUp
    },
    {
      label: '24h Low',
      value: `$${(currentPrice * 0.95).toFixed(2)}`,
      change: '-1.8%',
      positive: false,
      icon: TrendingDown
    },
    {
      label: 'Market Cap',
      value: '$45.2B',
      change: '+3.4%',
      positive: true,
      icon: DollarSign
    },
    {
      label: 'Active Traders',
      value: '2,847',
      change: '+12.5%',
      positive: true,
      icon: Users
    },
    {
      label: 'Total Orders',
      value: '15,234',
      change: '+8.9%',
      positive: true,
      icon: Activity
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect rounded-xl p-4"
    >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className="h-4 w-4 text-slate-400" />
                <div className={`text-xs font-medium ${
                  stat.positive ? 'text-green-400' : 'text-red-400'
                }`}>
                  {stat.change}
                </div>
              </div>
              
              <div className="text-lg font-bold text-white mb-1">
                {stat.value}
              </div>
              
              <div className="text-xs text-slate-400">
                {stat.label}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default MarketStats;