import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { ethers } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { useContracts } from '../hooks/useContracts';
import { createLimitOrder, signLimitOrder, createDomain, validateOrder, getOrderExpiry, LIMIT_ORDER_TYPES } from '../lib/eip712';

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
  const { contracts } = useContracts(signer);

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

  const handlePriceChange = (value) => {
    setPrice(value);
    if (amount && value) {
      setTotal((parseFloat(amount) * parseFloat(value)).toFixed(2));
    }
  };

  const handleSubmitOrder = async () => {
    // Basic validation
    if (!isConnected) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to place an order",
        variant: "destructive"
      });
      return;
    }

    if (!baseTokenAddress || !quoteTokenAddress || !ethers.isAddress(baseTokenAddress) || !ethers.isAddress(quoteTokenAddress)) {
      toast({
        title: "Invalid Addresses",
        description: "Please enter valid token addresses",
        variant: "destructive"
      });
      return;
    }

    if (baseTokenAddress.toLowerCase() === quoteTokenAddress.toLowerCase()) {
      toast({
        title: "Invalid Pair",
        description: "Base and quote tokens cannot be the same",
        variant: "destructive"
      });
      return;
    }

    if (!amount || !price) {
      toast({
        title: "Invalid Order",
        description: "Please enter valid amount and price",
        variant: "destructive"
      });
      return;
    }

    if (!contracts || !signer || !account) {
      toast({
        title: "Contracts Not Ready",
        description: "Please wait for contracts to initialize",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);

      console.log('🔄 Placing order...');
      console.log('  Base Token:', baseTokenAddress);
      console.log('  Quote Token:', quoteTokenAddress);
      console.log('  Amount:', amount);
      console.log('  Price:', price);
      console.log('  Side:', side);

      // Check if pair exists first
      const tickSizeBigInt = BigInt(tickSize);
      const pairAddress = await contracts.factory.getClobPair(baseTokenAddress, quoteTokenAddress, tickSizeBigInt);
      
      if (pairAddress === ethers.ZeroAddress) {
        throw new Error('Trading pair does not exist. Please create it first using Factory contract.');
      }

      console.log('✅ Found ClobPair:', pairAddress);

      // Get user nonce
      const nonce = await contracts.router.getUserNonce(account);
      console.log('📋 User nonce:', nonce.toString());

      // Create order
      const order = createLimitOrder(
        account,
        baseTokenAddress,
        quoteTokenAddress,
        amount,
        price,
        side === 'sell',
        getOrderExpiry(60), // 1 hour expiry
        nonce
      );
      
      console.log('📝 Created order:', {
        maker: order.maker,
        baseToken: order.baseToken,
        quoteToken: order.quoteToken,
        baseAmount: `${order.baseAmount.toString()} (${ethers.formatUnits(order.baseAmount, 6)} tokens)`,
        price: `${order.price.toString()} (${ethers.formatUnits(order.price, 18)} quote per base)`,
        isSellBase: order.isSellBase,
        expiry: order.expiry.toString(),
        nonce: order.nonce.toString()
      });

      // Validate order struct format
      const MAX_UINT64 = 2n ** 64n - 1n;
      const MAX_UINT256 = 2n ** 256n - 1n;
      
      if (order.baseAmount > MAX_UINT64) {
        throw new Error(`baseAmount ${order.baseAmount} exceeds uint64 max (${MAX_UINT64})`);
      }
      
      if (order.price > MAX_UINT256) {
        throw new Error(`price ${order.price} exceeds uint256 max`);
      }
      
      if (order.expiry > MAX_UINT256) {
        throw new Error(`expiry ${order.expiry} exceeds uint256 max`);
      }
      
      if (order.nonce > MAX_UINT256) {
        throw new Error(`nonce ${order.nonce} exceeds uint256 max`);
      }
      
      console.log('✅ Order struct validation passed');

      // Validate order
      const validation = validateOrder(order);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // Use Router domain for signing (Router will verify signature)
      const domain = createDomain(Number(chainId), contracts.router.target);
      console.log('🔍 EIP712 Domain (using Router address):', domain);

      // WORKAROUND: We need to check if the smart contracts have been fixed
      // If not, we might need to use a different approach
      console.log('🔍 Checking if Router and ClobPair use same domain separator...');

      // Check if we can call without signature (if maker == msg.sender)
      console.log('🔍 Account check:', account, 'vs order.maker:', order.maker);
      let signature;
      if (account.toLowerCase() === order.maker.toLowerCase()) {
        console.log('✅ Maker is msg.sender - no signature required');
        signature = '0x'; // Empty signature
      } else {
        // Sign the order
        console.log('✍️ Signing order...');
        signature = await signLimitOrder(signer, order, domain);
        console.log('Signature:', signature);
        console.log('Signature length:', signature.length);
      }
      
      // Test signature recovery locally (only if signature is not empty)
      if (signature !== '0x') {
        try {
          const orderHash = await contracts.router.hashOrder(order);
          console.log('Order hash from Router:', orderHash);
          
          // Test EIP712 signature recovery 
          const recoveredAddress = ethers.verifyTypedData(domain, LIMIT_ORDER_TYPES, {
            maker: order.maker,
            baseToken: order.baseToken,
            quoteToken: order.quoteToken,
            baseAmount: order.baseAmount.toString(),
            price: order.price.toString(),
            isSellBase: order.isSellBase,
            expiry: order.expiry.toString(),
            nonce: order.nonce.toString()
          }, signature);
          
          console.log('EIP712 recovered address:', recoveredAddress);
          console.log('Expected maker:', order.maker);
          console.log('EIP712 signature recovery matches:', recoveredAddress.toLowerCase() === order.maker.toLowerCase());
        } catch (recoverError) {
          console.error('Error testing signature recovery:', recoverError);
        }
      } else {
        console.log('✅ Skipping signature recovery test (empty signature for self-signed order)');
      }
      
      // Pre-flight validation
      console.log('🔍 Pre-flight validation...');
      
      // Check if tokens are supported in Vault
      const [isBaseSupported, isQuoteSupported] = await Promise.all([
        contracts.vault.isSupportedToken(order.baseToken),
        contracts.vault.isSupportedToken(order.quoteToken)
      ]);
      
      console.log('Token support:', { isBaseSupported, isQuoteSupported });
      if (!isBaseSupported) {
        throw new Error(`Base token ${order.baseToken} not supported in Vault`);
      }
      if (!isQuoteSupported) {
        throw new Error(`Quote token ${order.quoteToken} not supported in Vault`);
      }
      
      // Check if Router is authorized executor
      const isAuthorized = await contracts.vault.isExecutor(contracts.router.target);
      console.log('Router authorized:', isAuthorized);
      if (!isAuthorized) {
        throw new Error('Router is not authorized executor in Vault');
      }
      
      // Check user balance in Vault
      const tokenToCheck = side === 'sell' ? order.baseToken : order.quoteToken;
      const requiredAmount = side === 'sell' ? 
        order.baseAmount : 
        (order.baseAmount * order.price) / (10n ** 18n);
      
      const availableBalance = await contracts.vault.getAvailableBalance(account, tokenToCheck);
      console.log('Balance check:', {
        tokenToCheck: tokenToCheck.slice(0,6) + '...',
        required: ethers.formatUnits(requiredAmount, 18),
        available: ethers.formatUnits(availableBalance, 18)
      });
      
      if (availableBalance < requiredAmount) {
        const deficit = requiredAmount - availableBalance;
        console.log('💰 Insufficient balance, need to deposit:', ethers.formatUnits(deficit, 18));
        
        // Check wallet balance first
          const tokenContract = new ethers.Contract(tokenToCheck, [
          "function balanceOf(address) view returns (uint256)",
          "function allowance(address, address) view returns (uint256)",
          "function approve(address, uint256) returns (bool)"
          ], signer);
          
          const walletBalance = await tokenContract.balanceOf(account);
        console.log('Wallet balance:', ethers.formatUnits(walletBalance, 18));
          
          if (walletBalance < deficit) {
          throw new Error(`Insufficient wallet balance. Need ${ethers.formatUnits(deficit, 18)} more tokens in wallet`);
          }
          
          // Check allowance
          const allowance = await tokenContract.allowance(account, contracts.vault.target);
        console.log('Current allowance:', ethers.formatUnits(allowance, 18));
          
          if (allowance < deficit) {
          console.log('📝 Approving Vault...');
            const approveTx = await tokenContract.approve(contracts.vault.target, deficit);
            await approveTx.wait();
            console.log('✅ Approval successful');
          }
          
          // Deposit to Vault
          console.log('💾 Depositing to Vault...');
          const depositTx = await contracts.vault.deposit(tokenToCheck, deficit);
          await depositTx.wait();
          console.log('✅ Deposit successful');
      }

      // Debug order data before submitting
      console.log('🔍 Final order debugging:');
      console.log('Order object:', order);
      console.log('Order types check:', {
        maker: typeof order.maker,
        baseToken: typeof order.baseToken,
        quoteToken: typeof order.quoteToken,
        baseAmount: typeof order.baseAmount,
        price: typeof order.price,
        isSellBase: typeof order.isSellBase,
        expiry: typeof order.expiry,
        nonce: typeof order.nonce
      });

      // Test order hash calculation directly
      const routerOrderHash = await contracts.router.hashOrder(order);
      console.log('🔍 Router calculated order hash:', routerOrderHash);
      
      // CRITICAL DEBUG: Check what hash Router and ClobPair calculate
      try {
        const routerHash = await contracts.router.hashOrder(order);
        console.log('🔍 Router calculates hash:', routerHash);
        
        // Get ClobPair address and test its hash calculation if possible
        const pairAddr = await contracts.factory.getClobPair(order.baseToken, order.quoteToken, BigInt(tickSize));
        console.log('🔍 ClobPair address:', pairAddr);
        
        if (pairAddr !== ethers.ZeroAddress) {
          // Try to call ClobPair's internal hash function (will likely fail since it's internal)
          console.log('🔍 Router expects hash:', routerHash);
          console.log('🔍 But ClobPair likely calculates different hash due to different domain separator');
          console.log('❌ This is why we get "Router: hash mismatch"');
        }
      } catch (debugError) {
        console.error('Debug error:', debugError);
      }
      
      // Try to simulate the call first to get better error info
      try {
        console.log('🧪 Simulating Router.placeLimitOrder call...');
        await contracts.router.placeLimitOrder.staticCall(order, signature);
        console.log('✅ Static call successful');
      } catch (staticError) {
        console.error('❌ Static call failed:', staticError);
        
        // Try to get more detailed error info
        if (staticError.data) {
          console.log('Error data:', staticError.data);
        }
        
        throw new Error(`Static call failed: ${staticError.message}`);
      }

      // Estimate gas
      try {
        console.log('⛽ Estimating gas...');
        const gasEstimate = await contracts.router.placeLimitOrder.estimateGas(order, signature);
        console.log('✅ Gas estimate:', gasEstimate.toString());
      } catch (gasError) {
        console.error('❌ Gas estimation failed:', gasError);
        
        // Additional debugging for gas estimation failure
        console.log('Transaction data would be:', {
          to: contracts.router.target,
          data: contracts.router.interface.encodeFunctionData('placeLimitOrder', [order, signature])
        });
        
        throw new Error(`Gas estimation failed: ${gasError.message}`);
      }

      // Submit to Router
      console.log('📤 Submitting order via Router...');
      const tx = await contracts.router.placeLimitOrder(order, signature);
      console.log('⏳ Waiting for confirmation...');
      await tx.wait();
      console.log('✅ Order placed successfully!');

      // Reset form
      setAmount('');
      setTotal('');

      toast({
        title: "Order Placed Successfully! 🎉",
        description: `${side.toUpperCase()} ${amount} tokens at $${price}`,
      });

    } catch (error) {
      console.error('Error placing order:', error);
      toast({
        title: "Order Failed",
        description: error.message || "An error occurred while placing the order",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const setPercentage = (percentage) => {
    if (!isConnected) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to use this feature",
        variant: "destructive"
      });
      return;
    }
    // Mock balance calculation
    const mockBalance = side === 'buy' ? 10000 : 5.5;
    const currentOrderPrice = parseFloat(price) || 2500;

    const calculatedAmount = side === 'buy' 
      ? (mockBalance * percentage / 100 / currentOrderPrice).toFixed(6)
      : (mockBalance * percentage / 100).toFixed(6);
    
    handleAmountChange(calculatedAmount);
  };

  const checkPairExists = async () => {
    if (!baseTokenAddress || !quoteTokenAddress || !tickSize) {
      toast({
        title: "Missing Information",
        description: "Please enter token addresses and tick size first",
        variant: "destructive"
      });
      return;
    }

    if (!ethers.isAddress(baseTokenAddress) || !ethers.isAddress(quoteTokenAddress)) {
      toast({
        title: "Invalid Addresses",
        description: "Please enter valid 42-character addresses",
        variant: "destructive"
      });
      return;
    }

    if (!contracts) {
      toast({
        title: "Contracts Not Ready",
        description: "Please wait for contracts to initialize",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsCheckingPair(true);
      setPairStatus(null);

      console.log('🔍 Checking pair existence...');
      console.log('Base Token:', baseTokenAddress);
      console.log('Quote Token:', quoteTokenAddress);
      console.log('Tick Size:', tickSize);
      
      const tickSizeBigInt = BigInt(tickSize);
      
      const pairAddress = await contracts.factory.getClobPair(baseTokenAddress, quoteTokenAddress, tickSizeBigInt);
      console.log('📍 Pair address result:', pairAddress);
      
      if (pairAddress === ethers.ZeroAddress) {
        setPairStatus({ exists: false, address: null });
        toast({
          title: "Pair Not Found ❌",
          description: "This trading pair does not exist. Create it first using Factory.",
          variant: "destructive"
        });
      } else {
        setPairStatus({ exists: true, address: pairAddress });
        toast({
          title: "Pair Found! ✅",
          description: `Trading pair exists: ${pairAddress.slice(0,6)}...${pairAddress.slice(-4)}`,
        });
      }
    } catch (error) {
      console.error('❌ Error checking pair:', error);
      setPairStatus({ exists: false, error: error.message });
      toast({
        title: "Check Failed",
        description: error.message || "Failed to check pair existence",
        variant: "destructive"
      });
    } finally {
      setIsCheckingPair(false);
    }
  };

  const debugRouterCall = async () => {
    console.log('🔍 Debug Router Call Starting...');
    console.log('Contracts available:', !!contracts);
    console.log('Account:', account);
    
    if (!contracts) {
      console.log('❌ Contracts not available');
      toast({
        title: "Contracts Not Ready",
        description: "Please wait for contracts to initialize",
        variant: "destructive"
      });
      return;
    }
    
    if (!account) {
      console.log('❌ Account not connected');
      toast({
        title: "Wallet Not Connected", 
        description: "Please connect your wallet first",
        variant: "destructive"
      });
      return;
    }
    
    try {
      console.log('🔍 Debug Router Call:');
      
      // Test basic router functions
      console.log('1. Testing getUserNonce...');
      const nonce = await contracts.router.getUserNonce(account);
      console.log('✅ User nonce:', nonce.toString());
      
      console.log('2. Testing hashOrder...');
      const testOrder = {
        maker: account,
        baseToken: baseTokenAddress || ethers.ZeroAddress,
        quoteToken: quoteTokenAddress || ethers.ZeroAddress,
        baseAmount: 1000000000000000000n, // 1 token
        price: 2500000000000000000000n, // 2500 quote per base
        isSellBase: false,
        expiry: BigInt(Math.floor(Date.now() / 1000) + 3600),
        nonce: nonce
      };
      
      const orderHash = await contracts.router.hashOrder(testOrder);
      console.log('✅ Order hash:', orderHash);
      
      console.log('3. Testing domain separator...');
      const domainSep = await contracts.router.domainSeparator();
      console.log('✅ Domain separator:', domainSep);
      
      console.log('4. Testing orderExists...');
      const exists = await contracts.router.orderExists(orderHash);
      console.log('✅ Order exists:', exists);
      
      // 5. Compare domain separators
      if (baseTokenAddress && quoteTokenAddress && tickSize) {
        console.log('5. Comparing Router vs ClobPair domain separators...');
        try {
          const pairAddress = await contracts.factory.getClobPair(baseTokenAddress, quoteTokenAddress, BigInt(tickSize));
          console.log('Pair address:', pairAddress);
          
          if (pairAddress !== ethers.ZeroAddress) {
            const pairContract = new ethers.Contract(pairAddress, [
              "function domainSeparator() view returns (bytes32)"
            ], signer);
            
            const routerDomain = await contracts.router.domainSeparator();
            const pairDomain = await pairContract.domainSeparator();
            
            console.log('🔍 CRITICAL COMPARISON:');
            console.log('Router domain:', routerDomain);
            console.log('Pair domain:  ', pairDomain);
            console.log('Are equal?    ', routerDomain === pairDomain);
            
            if (routerDomain !== pairDomain) {
              console.log('🎯 FOUND THE ISSUE! Domain separators are different!');
              console.log('🎯 This is why we get "Router: hash mismatch"');
            } else {
              console.log('✅ Domain separators match - issue is elsewhere');
            }
          } else {
            console.log('❌ Pair does not exist');
          }
        } catch (domainError) {
          console.error('❌ Domain comparison failed:', domainError);
        }
      }
      
    } catch (error) {
      console.error('❌ Debug router call failed:', error);
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
      console.log('🏭 Creating new trading pair...');
      console.log('  Base:', baseTokenAddress);
      console.log('  Quote:', quoteTokenAddress);
      console.log('  TickSize:', tickSize);

      const tickSizeBigInt = BigInt(tickSize);
      const tx = await contracts.factory.createClobPair(baseTokenAddress, quoteTokenAddress, tickSizeBigInt);
      
      toast({
        title: "Creating Pair...",
        description: "Transaction submitted. Please wait for confirmation.",
      });

      await tx.wait();
      
      toast({
        title: "Pair Created! 🎉",
        description: "Trading pair has been created successfully",
      });

      // Refresh pair status
      await checkPairExists();
      
    } catch (error) {
      console.error('❌ Error creating pair:', error);
      toast({
        title: "Pair Creation Failed",
        description: error.message || "Failed to create trading pair",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="glass-effect rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Place Order</h2>
        <div className="flex items-center space-x-1">
          <Wallet className="h-4 w-4 text-slate-400" />
          <span className="text-xs text-slate-400">
            {isConnected ? 'Connected' : 'Not Connected'}
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
            {type === 'limit' ? 'Limit' : 'Market'}
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
          <span>Buy</span>
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
          <span>Sell</span>
        </button>
      </div>

      <div className="space-y-4 flex-1">
        {/* Base Token Address */}
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

        {/* Quote Token Address */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Quote Token Address
          </label>
          <input
            type="text"
            value={quoteTokenAddress}
            onChange={(e) => setQuoteTokenAddress(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm font-mono"
            placeholder="0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
          />
        </div>

        {/* Tick Size */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Tick Size
          </label>
          <div className="flex space-x-2">
            <input
              type="number"
              value={tickSize}
              onChange={(e) => setTickSize(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="10000000000000000"
              min="1"
            />
            <Button
              onClick={checkPairExists}
              disabled={isCheckingPair || !isConnected}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
            >
              {isCheckingPair ? 'Checking...' : 'Check Pair'}
            </Button>
            <Button
              onClick={debugRouterCall}
              disabled={!isConnected}
              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-xs font-medium transition-all"
            >
              Debug
            </Button>
          </div>
          
          {/* Pair Status Indicator */}
          {pairStatus && (
            <div className={`mt-2 p-2 rounded-lg text-sm ${
              pairStatus.exists 
                ? 'bg-green-900/30 border border-green-600/30 text-green-400' 
                : 'bg-red-900/30 border border-red-600/30 text-red-400'
            }`}>
              {pairStatus.exists ? (
                <>✅ Pair exists: {pairStatus.address?.slice(0,6)}...{pairStatus.address?.slice(-4)}</>
              ) : (
                <div className="flex justify-between items-center">
                  <span>❌ Pair not found {pairStatus.error ? `(${pairStatus.error})` : ''}</span>
                  <button
                    onClick={createNewPair}
                    disabled={!isConnected || isSubmitting}
                    className="ml-2 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                  >
                    Create Pair
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Price Input */}
        {orderType === 'limit' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Price (Quote Token)
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
            Amount (Base Token)
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
            Total (Quote Token)
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
            <span className="text-slate-400">Available:</span>
            <span className="text-white">
              {isConnected ? (side === 'buy' ? '10,000.00 Quote' : '5.5000 Base') : 'N/A'}
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
          disabled={!isConnected || isSubmitting || !baseTokenAddress || !quoteTokenAddress}
        >
          <ShoppingCart className="h-4 w-4 mr-2" />
          {isSubmitting ? 'Processing...' : `${side === 'buy' ? 'Buy' : 'Sell'} Order`}
        </Button>
      </motion.div>

      {!isConnected && (
        <div className="mt-2 text-center text-xs text-slate-400">
          Connect wallet to start trading
        </div>
      )}
    </div>
  );
};

export default TradingForm;