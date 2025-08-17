import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, ChevronDown, Copy, ExternalLink, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useWeb3 } from '../hooks/useWeb3';

const WalletConnection = () => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { account, isConnected, connectWallet, disconnectWallet } = useWeb3();

  const wallets = [
    { name: 'MetaMask', icon: '🦊', popular: true },
    { name: 'WalletConnect', icon: '🔗', popular: true },
    { name: 'Coinbase Wallet', icon: '🔵', popular: false },
    { name: 'Trust Wallet', icon: '🛡️', popular: false }
  ];

  const handleConnect = async (walletName) => {
    if (walletName === 'MetaMask') {
      await connectWallet();
      setIsDropdownOpen(false);
    } else {
      toast({
        title: "Chỉ hỗ trợ MetaMask",
        description: "Hiện tại chỉ hỗ trợ kết nối MetaMask",
        variant: "destructive"
      });
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setIsDropdownOpen(false);
  };

  const copyAddress = () => {
    if (account) {
      navigator.clipboard.writeText(account);
      toast({
        title: "Đã sao chép địa chỉ",
        description: "Địa chỉ ví đã được sao chép vào clipboard"
      });
    }
  };

  if (!isConnected) {
    return (
      <div className="relative">
        <Button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
        >
          <Wallet className="h-4 w-4" />
          <span>Kết nối ví</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </Button>

        {isDropdownOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute right-0 mt-2 w-64 glass-effect rounded-xl p-4 z-50 border border-slate-600"
          >
            <div className="mb-3">
              <h3 className="text-white font-semibold mb-1">Kết nối ví</h3>
              <p className="text-slate-400 text-xs">Chọn ví bạn muốn kết nối</p>
            </div>

            <div className="space-y-2">
              {wallets.map((wallet) => (
                <motion.button
                  key={wallet.name}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleConnect(wallet.name)}
                  className="w-full flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-all border border-slate-700 hover:border-slate-600"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-xl">{wallet.icon}</span>
                    <span className="text-white font-medium">{wallet.name}</span>
                  </div>
                  {wallet.popular && (
                    <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full">
                      Phổ biến
                    </span>
                  )}
                </motion.button>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-700">
              <p className="text-xs text-slate-400 text-center">
                Bằng cách kết nối, bạn đồng ý với Điều khoản dịch vụ của chúng tôi
              </p>
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <Button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
      >
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
        <span className="font-mono text-sm">
          {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Unknown'}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isDropdownOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="absolute right-0 mt-2 w-72 glass-effect rounded-xl p-4 z-50 border border-slate-600"
        >
          <div className="mb-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-3 h-3 bg-green-400 rounded-full"></div>
              <span className="text-white font-semibold">Ví đã kết nối</span>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-slate-300">{account || 'Unknown'}</span>
                <button
                  onClick={copyAddress}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400 text-sm">Số dư</span>
                <span className="text-white font-semibold">2.45 ETH</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Giá trị USD</span>
                <span className="text-green-400 font-semibold">$6,019.11</span>
              </div>
            </div>

            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast({ title: "🚧 Chế độ xem explorer chưa được triển khai—nhưng đừng lo! Bạn có thể yêu cầu nó trong lần nhắc tiếp theo! 🚀" })}
                className="flex-1 border-slate-600 hover:bg-slate-700"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Explorer
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                className="flex-1 border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Ngắt kết nối
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default WalletConnection;