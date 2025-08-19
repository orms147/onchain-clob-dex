import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { ethers } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { useContracts } from '../hooks/useContracts';
import { createLimitOrder, signLimitOrder, createDomain, validateOrder, getOrderExpiry } from '../lib/eip712';

const TradingForm = () => {
  const [orderType, setOrderType] = useState('limit');
  const [side, setSide] = useState('buy');
  const [baseTokenAddress, setBaseTokenAddress] = useState('');
  const [quoteTokenAddress, setQuoteTokenAddress] = useState('');
  const [tickSize, setTickSize] = useState('10000000000000000');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [total, setTotal] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingPair, setIsCheckingPair] = useState(false);
  const [pairStatus, setPairStatus] = useState(null);

  const { provider, signer, account, isConnected, chainId } = useWeb3();
  const { contracts, placeLimitOrder, hashOrder, getUserNonce } = useContracts(signer);

  useEffect(() => {
    if (orderType === 'limit') {
      setPrice('2500');
    } else {
      setPrice('');
    }
    setAmount('');
    setTotal('');
  }, [orderType, side]);

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

  const checkPairExists = async () => {
    if (!baseTokenAddress || !quoteTokenAddress || !tickSize || !contracts) {
      toast({
        title: "Missing Information",
        description: "Please fill in all token addresses and tick size",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsCheckingPair(true);
      setPairStatus(null);
      
      const tickSizeBigInt = BigInt(tickSize);
      const pairAddress = await contracts.factory.getClobPair(baseTokenAddress, quoteTokenAddress, tickSizeBigInt);

      if (pairAddress === ethers.ZeroAddress) {
        setPairStatus({ exists: false, address: null });
        toast({
          title: "Pair Not Found",
          description: "This trading pair doesn't exist. Create it first.",
          variant: "destructive"
        });
      } else {
        setPairStatus({ exists: true, address: pairAddress });
        toast({
          title: "Pair Found",
          description: `Trading pair exists at ${pairAddress.slice(0, 6)}...${pairAddress.slice(-4)}`,
        });
      }
    } catch (error) {
      console.error('Error checking pair:', error);
      toast({
        title: "Error",
        description: "Failed to check if pair exists",
        variant: "destructive"
      });
    } finally {
      setIsCheckingPair(false);
    }
  };

  const createNewPair = async () => {
    if (!baseTokenAddress || !quoteTokenAddress || !tickSize || !contracts) {
      toast({
        title: "Cannot Create Pair",
        description: "Please ensure all fields are filled and contracts are ready",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const tickSizeBigInt = BigInt(tickSize);
      const tx = await contracts.factory.createClobPair(baseTokenAddress, quoteTokenAddress, tickSizeBigInt);
      
      await tx.wait();
      
      toast({
        title: "Pair Created Successfully",
        description: "New trading pair has been created",
      });
      
      await checkPairExists();
    } catch (error) {
      console.error('Error creating pair:', error);
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create trading pair",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to place orders",
        variant: "destructive"
      });
      return;
    }

    if (!contracts) {
      toast({
        title: "Contracts Not Ready",
        description: "Please wait for contracts to load",
        variant: "destructive"
      });
      return;
    }

    if (!amount || !price || !baseTokenAddress || !quoteTokenAddress) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const pairAddress = await contracts.factory.getClobPair(baseTokenAddress, quoteTokenAddress, BigInt(tickSize));
      
      if (pairAddress === ethers.ZeroAddress) {
        throw new Error('Trading pair does not exist. Please create it first using Factory contract.');
      }

      const nonce = await getUserNonce(account);

      const order = createLimitOrder(
        account,
        baseTokenAddress,
        quoteTokenAddress,
        amount,
        price,
        side === 'sell',
        getOrderExpiry(60),
        nonce
      );

      const domain = createDomain(Number(chainId), contracts.router.target);

      let signature;
      if (account.toLowerCase() === order.maker.toLowerCase()) {
        signature = '0x';
      } else {
        signature = await signLimitOrder(signer, order, domain);
      }

      const tokenToCheck = side === 'sell' ? baseTokenAddress : quoteTokenAddress;
      const requiredAmount = side === 'sell' 
        ? ethers.parseUnits(amount, 6)
        : ethers.parseUnits(total, 18);

      const availableBalance = await contracts.vault.getAvailableBalance(account, tokenToCheck);
      
      if (availableBalance < requiredAmount) {
        const deficit = requiredAmount - availableBalance;
        
        const tokenContract = new ethers.Contract(tokenToCheck, [
          "function balanceOf(address) view returns (uint256)",
          "function allowance(address,address) view returns (uint256)", 
          "function approve(address,uint256) returns (bool)"
        ], signer);
        
        const walletBalance = await tokenContract.balanceOf(account);
        
        if (walletBalance < deficit) {
          throw new Error(`Insufficient wallet balance. Need ${ethers.formatUnits(deficit, 18)} more tokens in wallet`);
        }
        
        const allowance = await tokenContract.allowance(account, contracts.vault.target);
        
        if (allowance < deficit) {
          const approveTx = await tokenContract.approve(contracts.vault.target, deficit);
          await approveTx.wait();
        }
        
        const depositTx = await contracts.vault.deposit(tokenToCheck, deficit);
        await depositTx.wait();
      }

      const tx = await placeLimitOrder(order, signature);
      
      toast({
        title: "Order Placed Successfully",
        description: `${side.toUpperCase()} order for ${amount} tokens at $${price}`,
      });

      setAmount('');
      setTotal('');
      
    } catch (error) {
      console.error('Error placing order:', error);
      toast({
        title: "Order Failed",
        description: error.message || "Failed to place order",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect rounded-xl p-6 h-full flex flex-col"
    >
      <h2 className="text-xl font-bold text-white mb-6 flex items-center">
        <ShoppingCart className="mr-2 h-6 w-6" />
        Place Order
        {isConnected && (
          <span className="ml-auto text-sm text-green-400 flex items-center">
            <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
            Connected
          </span>
        )}
      </h2>

      <div className="flex space-x-2 mb-6">
        <Button
          onClick={() => setOrderType('limit')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
            orderType === 'limit'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Limit
        </Button>
        <Button
          onClick={() => setOrderType('market')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
            orderType === 'market'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Market
        </Button>
      </div>

      <div className="flex space-x-2 mb-6">
        <Button
          onClick={() => setSide('buy')}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
            side === 'buy'
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <TrendingUp className="mr-2 h-4 w-4" />
          Buy
        </Button>
        <Button
          onClick={() => setSide('sell')}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
            side === 'sell'
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <TrendingDown className="mr-2 h-4 w-4" />
          Sell
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Base Token Address
          </label>
          <input
            type="text"
            value={baseTokenAddress}
            onChange={(e) => setBaseTokenAddress(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm font-mono"
            placeholder="0x1234567890123456789012345678901234567890"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Quote Token Address
          </label>
          <input
            type="text"
            value={quoteTokenAddress}
            onChange={(e) => setQuoteTokenAddress(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm font-mono"
            placeholder="0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Tick Size
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={tickSize}
              onChange={(e) => setTickSize(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm font-mono"
              placeholder="10000000000000000"
            />
            <Button
              type="button"
              onClick={checkPairExists}
              disabled={isCheckingPair || !isConnected}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
            >
              {isCheckingPair ? 'Checking...' : 'Check Pair'}
            </Button>
          </div>
          
          {pairStatus && (
            <div className="mt-2">
              {pairStatus.exists ? (
                <div className="text-green-400 text-sm">
                  ✅ Pair exists: {pairStatus.address.slice(0, 6)}...{pairStatus.address.slice(-4)}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-red-400 text-sm">❌ Pair does not exist</div>
                  <Button
                    type="button"
                    onClick={createNewPair}
                    disabled={isSubmitting || !isConnected}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-xs"
                  >
                    Create Pair
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {orderType === 'limit' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Price (Quote Token)
            </label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="0.00"
              required
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Amount (Base Token)
          </label>
          <input
            type="number"
            step="0.000001"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="0.00"
            required
          />
          <div className="flex space-x-2 mt-2">
            <Button
              type="button"
              onClick={() => handleAmountChange((parseFloat(amount || '0') * 0.25).toFixed(6))}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-1 rounded text-xs"
            >
              25%
            </Button>
            <Button
              type="button"
              onClick={() => handleAmountChange((parseFloat(amount || '0') * 0.5).toFixed(6))}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-1 rounded text-xs"
            >
              50%
            </Button>
            <Button
              type="button"
              onClick={() => handleAmountChange((parseFloat(amount || '0') * 0.75).toFixed(6))}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-1 rounded text-xs"
            >
              75%
            </Button>
            <Button
              type="button"
              onClick={() => handleAmountChange((parseFloat(amount || '0') * 1).toFixed(6))}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-1 rounded text-xs"
            >
              100%
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Total (Quote Token)
          </label>
          <input
            type="number"
            step="0.01"
            value={total}
            onChange={(e) => handleTotalChange(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="0.00"
          />
          <div className="text-xs text-slate-400 mt-1">
            Available: 10,000.00 Quote
          </div>
        </div>

        <div className="flex-1"></div>

        <div className="text-center">
          <div className="flex items-center justify-between mb-2 text-sm text-slate-400">
            <span>Est. Fee</span>
            <span>~0.001 ETH</span>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <Wallet className="h-4 w-4 text-slate-400" />
          <span className="text-xs text-slate-400">
            {isConnected ? 'Connected' : 'Not Connected'}
          </span>
        </div>

        <Button
          type="submit"
          disabled={!isConnected || isSubmitting || !amount || !price}
          className={`w-full py-3 rounded-lg font-semibold transition-all ${
            side === 'buy'
              ? 'bg-green-600 hover:bg-green-700 text-white disabled:bg-slate-600'
              : 'bg-red-600 hover:bg-red-700 text-white disabled:bg-slate-600'
          }`}
        >
          {isSubmitting
            ? 'Processing...'
            : `${side === 'buy' ? 'Buy' : 'Sell'} ${side === 'buy' ? 'with' : 'for'} ${side === 'buy' ? total : amount}`
          }
        </Button>
      </form>
    </motion.div>
  );
};

export default TradingForm;
