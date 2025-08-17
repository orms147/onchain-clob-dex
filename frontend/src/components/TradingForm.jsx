import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const TradingForm = ({ selectedPair, currentPrice, isConnected }) => {
  const [orderType, setOrderType] = useState('limit');
  const [side, setSide] = useState('buy');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [total, setTotal] = useState('');

  const [baseToken, quoteToken] = selectedPair.split('/');

  useEffect(() => {
    if (orderType === 'limit') {
      setPrice(currentPrice.toFixed(2));
    } else {
      setPrice('');
    }
    setAmount('');
    setTotal('');
  }, [selectedPair, currentPrice, orderType, side]);

  const handleAmountChange = (value) => {
    setAmount(value);
    if (value && price) {
      setTotal((parseFloat(value) * parseFloat(price)).toFixed(2));
    } else {
      setTotal('');
    }
  };

  const handleTotalChange = (value) => {
    setTotal(value);
    if (value && price) {
      setAmount((parseFloat(value) / parseFloat(price)).toFixed(6));
    } else {
      setAmount('');
    }
  };

  const handlePriceChange = (value) => {
    setPrice(value);
    if (amount && value) {
      setTotal((parseFloat(amount) * parseFloat(value)).toFixed(2));
    }
  };

  const handleSubmitOrder = () => {
    if (!isConnected) {
      toast({
        title: "Ví chưa được kết nối",
        description: "Vui lòng kết nối ví của bạn để đặt lệnh",
        variant: "destructive"
      });
      return;
    }

    if (!amount || (orderType === 'limit' && !price)) {
      toast({
        title: "Lệnh không hợp lệ",
        description: "Vui lòng nhập số lượng và giá hợp lệ",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "🚧 Việc đặt lệnh chưa được triển khai—nhưng đừng lo! Bạn có thể yêu cầu nó trong lần nhắc tiếp theo! 🚀",
      description: `${side.toUpperCase()} ${amount} ${baseToken} tại ${orderType === 'limit' ? `$${price}` : 'giá thị trường'}`
    });
  };

  const setPercentage = (percentage) => {
    if (!isConnected) {
      toast({
        title: "Ví chưa được kết nối",
        description: "Vui lòng kết nối ví để sử dụng tính năng này",
        variant: "destructive"
      });
      return;
    }
    // Mock balance calculation
    const mockBalance = side === 'buy' ? 10000 : 5.5;
    const currentOrderPrice = parseFloat(price) || currentPrice;

    const calculatedAmount = side === 'buy' 
      ? (mockBalance * percentage / 100 / currentOrderPrice).toFixed(6)
      : (mockBalance * percentage / 100).toFixed(6);
    
    handleAmountChange(calculatedAmount);
  };

  return (
    <div className="glass-effect rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Đặt lệnh</h2>
        <div className="flex items-center space-x-1">
          <Wallet className="h-4 w-4 text-slate-400" />
          <span className="text-xs text-slate-400">
            {isConnected ? 'Đã kết nối' : 'Chưa kết nối'}
          </span>
        </div>
      </div>

      {/* Order Type Tabs */}
      <div className="flex space-x-1 mb-4 bg-slate-800/50 rounded-lg p-1">
        {['limit', 'market'].map((type) => (
          <button
            key={type}
            onClick={() => setOrderType(type)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all capitalize ${
              orderType === type
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {type === 'limit' ? 'Giới hạn' : 'Thị trường'}
          </button>
        ))}
      </div>

      {/* Buy/Sell Tabs */}
      <div className="flex space-x-1 mb-6 bg-slate-800/50 rounded-lg p-1">
        <button
          onClick={() => setSide('buy')}
          className={`flex-1 py-3 px-4 rounded-md font-medium transition-all flex items-center justify-center space-x-2 ${
            side === 'buy'
              ? 'bg-green-600 text-white glow-green'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          <span>Mua</span>
        </button>
        <button
          onClick={() => setSide('sell')}
          className={`flex-1 py-3 px-4 rounded-md font-medium transition-all flex items-center justify-center space-x-2 ${
            side === 'sell'
              ? 'bg-red-600 text-white glow-red'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          <TrendingDown className="h-4 w-4" />
          <span>Bán</span>
        </button>
      </div>

      <div className="space-y-4 flex-1">
        {/* Price Input */}
        {orderType === 'limit' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Giá ({quoteToken})
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => handlePriceChange(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="0.00"
            />
          </div>
        )}

        {/* Amount Input */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Số lượng ({baseToken})
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="0.00"
          />
          
          {/* Percentage Buttons */}
          <div className="flex space-x-1 mt-2">
            {[25, 50, 75, 100].map((percentage) => (
              <button
                key={percentage}
                onClick={() => setPercentage(percentage)}
                className="flex-1 py-1 px-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
              >
                {percentage}%
              </button>
            ))}
          </div>
        </div>

        {/* Total */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Tổng ({quoteToken})
          </label>
          <input
            type="number"
            value={total}
            onChange={(e) => handleTotalChange(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="0.00"
          />
        </div>

        {/* Balance Display */}
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Khả dụng:</span>
            <span className="text-white">
              {isConnected ? (side === 'buy' ? '10,000.00 USDC' : '5.5000 ETH') : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="mt-6"
      >
        <Button
          onClick={handleSubmitOrder}
          className={`w-full py-3 font-semibold text-white transition-all ${
            side === 'buy'
              ? 'bg-green-600 hover:bg-green-700 glow-green'
              : 'bg-red-600 hover:bg-red-700 glow-red'
          }`}
          disabled={!isConnected}
        >
          <ShoppingCart className="h-4 w-4 mr-2" />
          {side === 'buy' ? 'Mua' : 'Bán'} {baseToken}
        </Button>
      </motion.div>

      {!isConnected && (
        <div className="mt-2 text-center text-xs text-slate-400">
          Kết nối ví để bắt đầu giao dịch
        </div>
      )}
    </div>
  );
};

export default TradingForm;