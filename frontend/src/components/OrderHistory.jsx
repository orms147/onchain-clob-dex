import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, CheckCircle, XCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useWeb3 } from '../hooks/useWeb3';
import { useContracts } from '../hooks/useContracts';
import { ethers } from 'ethers';

const OrderHistory = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const { account } = useWeb3();
  const { contracts } = useContracts();

  const refreshOrders = async () => {
    if (!contracts || !account) {
      setOrders([]);
      return;
    }

    try {
      setLoading(true);
      console.log('🔄 Refreshing orders for:', account);
      
      // Get OrderPlaced events for this user  
      const filter = contracts.router.filters.OrderPlaced(null, account);
      const events = await contracts.router.queryFilter(filter, -1000); // Increased from -100 to -1000
      
      console.log('📋 Found orders:', events.length);
      
      const userOrders = events.map((event, index) => {
        const args = event.args;
        const orderData = args[3];
        
        return {
          id: args[0],
          hash: args[0],
          maker: args[1],
          clobPair: args[2],
          baseToken: orderData?.baseToken || 'Unknown',
          quoteToken: orderData?.quoteToken || 'Unknown',
          baseAmount: orderData?.baseAmount ? 
            parseFloat(ethers.formatUnits(orderData.baseAmount, 6)).toFixed(4) : '0',
          price: orderData?.price ? 
            parseFloat(ethers.formatUnits(orderData.price, 18)).toFixed(4) : '0',
          side: orderData?.isSellBase ? 'SELL' : 'BUY',
          status: 'ACTIVE',
          timestamp: Date.now() - (index * 60000),
          blockNumber: event.blockNumber
        };
      }).reverse(); // Newest first
      
      setOrders(userOrders);
      
      if (userOrders.length > 0) {
        toast({
          title: "✅ Đã tải orders",
          description: `Tìm thấy ${userOrders.length} lệnh`,
        });
      }
      
    } catch (error) {
      console.error('❌ Error fetching orders:', error);
      toast({
        title: "❌ Lỗi tải orders",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshOrders();
  }, [contracts, account]);

  // Real-time order updates
  useEffect(() => {
    if (!contracts?.router || !account) return;

    const handleNewOrder = (orderHash, maker, clobPair, orderData) => {
      if (maker.toLowerCase() !== account.toLowerCase()) return;
      
      console.log('🆕 New order event:', { orderHash, maker, orderData });
      
      const newOrder = {
        id: orderHash,
        hash: orderHash,
        maker,
        clobPair,
        baseToken: orderData.baseToken,
        quoteToken: orderData.quoteToken,
        baseAmount: parseFloat(ethers.formatUnits(orderData.baseAmount, 6)).toFixed(4),
        price: parseFloat(ethers.formatUnits(orderData.price, 18)).toFixed(4),
        side: orderData.isSellBase ? 'SELL' : 'BUY',
        status: 'ACTIVE',
        timestamp: Date.now(),
        blockNumber: 'pending'
      };
      
      setOrders(prev => [newOrder, ...prev]);
      
      toast({
        title: "🎉 Order đã được đặt!",
        description: `${newOrder.side} ${newOrder.baseAmount} tokens tại giá ${newOrder.price}`,
      });
    };

    const filter = contracts.router.filters.OrderPlaced(null, account);
    contracts.router.on(filter, handleNewOrder);

    return () => {
      contracts.router.off(filter, handleNewOrder);
    };
  }, [contracts, account]);

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <Clock className="h-4 w-4 text-yellow-400" />;
      case 'FILLED':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'CANCELLED':
        return <XCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="glass-effect rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Lịch sử đặt lệnh</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{orders.length} lệnh</span>
          <Button
            size="sm"
            variant="outline"
            onClick={refreshOrders}
            disabled={loading}
            className="h-8 px-2"
          >
            <RefreshCcw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {loading && orders.length === 0 ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
            <p className="text-slate-400">Đang tải orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-400">Chưa có lệnh nào</p>
            <p className="text-xs text-slate-500 mt-1">Đặt lệnh đầu tiên để xem ở đây</p>
          </div>
        ) : (
          orders.map((order) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800/50 rounded-lg p-3 border border-slate-700"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getStatusIcon(order.status)}
                  <span className={`text-sm font-medium ${
                    order.side === 'BUY' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {order.side}
                  </span>
                  <span className="text-xs text-slate-400">{order.status}</span>
                </div>
                <span className="text-xs text-slate-400">
                  {formatTime(order.timestamp)}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400">Số lượng:</span>
                  <span className="text-white ml-1">{order.baseAmount}</span>
                </div>
                <div>
                  <span className="text-slate-400">Giá:</span>
                  <span className="text-white ml-1">{order.price}</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700">
                <span className="text-xs text-slate-500">
                  Hash: {order.hash.slice(0, 10)}...
                </span>
                <span className="text-xs text-slate-500">
                  Block: {order.blockNumber}
                </span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default OrderHistory;
