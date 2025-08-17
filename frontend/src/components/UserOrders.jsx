import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useWeb3 } from '../hooks/useWeb3';
import { useContracts } from '../hooks/useContracts';

const UserOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const { account, signer } = useWeb3();
  const { contracts, cancelOrder } = useContracts(signer);

  useEffect(() => {
    const fetchUserOrders = async () => {
      if (!contracts || !account) {
        setOrders([]);
        return;
      }

      try {
        setLoading(true);
        // For now, we'll show empty orders since we need to implement
        // order tracking from contract events
        setOrders([]);
      } catch (error) {
        console.error('Error fetching user orders:', error);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUserOrders();
  }, [contracts, account]);

  const handleCancelOrder = async (order) => {
    try {
      await cancelOrder(order);
      toast({
        title: "Lệnh đã được hủy",
        description: `Đã hủy lệnh ${order.side} ${order.amount} ${order.baseToken}`,
      });
      
      // Remove from local state
      setOrders(prev => prev.filter(o => o.id !== order.id));
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast({
        title: "Lỗi khi hủy lệnh",
        description: error.message || "Có lỗi xảy ra khi hủy lệnh",
        variant: "destructive"
      });
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="h-4 w-4 text-yellow-400" />;
      case 'PARTIALLY_FILLED':
        return <Clock className="h-4 w-4 text-blue-400" />;
      case 'FILLED':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'CANCELLED':
        return <XCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'PENDING':
        return 'Chờ khớp';
      case 'PARTIALLY_FILLED':
        return 'Khớp một phần';
      case 'FILLED':
        return 'Đã khớp';
      case 'CANCELLED':
        return 'Đã hủy';
      default:
        return 'Không xác định';
    }
  };

  return (
    <div className="glass-effect rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Lệnh của tôi</h2>
        <div className="text-xs text-slate-400">
          {orders.length} lệnh
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="text-center text-slate-400 py-8">
            Đang tải...
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-2 overflow-y-auto h-full">
            <AnimatePresence>
              {orders.map((order, index) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-slate-800/50 rounded-lg p-3 border border-slate-700"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm font-medium ${
                        order.side === 'buy' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {order.side === 'buy' ? 'MUA' : 'BÁN'}
                      </span>
                      <span className="text-white font-medium">
                        {order.pair}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(order.status)}
                      <span className="text-xs text-slate-400">
                        {getStatusText(order.status)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs text-slate-300 mb-3">
                    <div>
                      <div className="text-slate-500">Giá</div>
                      <div>${order.price}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Số lượng</div>
                      <div>{order.amount} {order.baseToken}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Đã khớp</div>
                      <div>{order.filled || 0} {order.baseToken}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Còn lại</div>
                      <div>{(order.amount - (order.filled || 0)).toFixed(4)} {order.baseToken}</div>
                    </div>
                  </div>

                  {(order.status === 'PENDING' || order.status === 'PARTIALLY_FILLED') && (
                    <Button
                      onClick={() => handleCancelOrder(order)}
                      variant="outline"
                      size="sm"
                      className="w-full border-red-600 text-red-400 hover:bg-red-600/10"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Hủy lệnh
                    </Button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="text-center text-slate-400 py-8">
            <div className="mb-2">Chưa có lệnh nào</div>
            <div className="text-xs">Đặt lệnh đầu tiên để bắt đầu giao dịch</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserOrders;
