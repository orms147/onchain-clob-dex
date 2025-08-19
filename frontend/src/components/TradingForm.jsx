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

      // Check if pair exists first
      const tickSizeBigInt = BigInt(tickSize);
      const pairAddress = await contracts.factory.getClobPair(baseTokenAddress, quoteTokenAddress, tickSizeBigInt);
      
      if (pairAddress === ethers.ZeroAddress) {
        throw new Error('Trading pair does not exist. Please create it first using Factory contract.');
      }

      // Get user nonce using useContracts hook
      const nonce = await getUserNonce(account);

      // Create order with correct types
      const order = createLimitOrder(
        account,                    // address maker
        baseTokenAddress,          // address baseToken
        quoteTokenAddress,         // address quoteToken
        amount,                    // string -> converts to uint64 internally
        price,                     // string -> converts to uint256 internally
        side === 'sell',          // bool isSellBase
        getOrderExpiry(60),       // number -> converts to uint256 expiry
        nonce                     // bigint nonce
      );

      // Validate order
      const validation = validateOrder(order);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // Use Router domain for signing (Router will verify signature)
      const domain = createDomain(Number(chainId), contracts.router.target);
      let signature;
      if (account.toLowerCase() === order.maker.toLowerCase()) {
        signature = '0x'; // Empty signature - no signature required for self-orders
      } else {
        // Sign the order
        signature = await signLimitOrder(signer, order, domain);
      }

      
      // Pre-flight validation
      // Check if tokens are supported in Vault
      const [isBaseSupported, isQuoteSupported] = await Promise.all([
        contracts.vault.isSupportedToken(order.baseToken),
        contracts.vault.isSupportedToken(order.quoteToken)
      ]);
      
      if (!isBaseSupported) {
        throw new Error(`Base token ${order.baseToken} not supported in Vault`);
      }
      if (!isQuoteSupported) {
        throw new Error(`Quote token ${order.quoteToken} not supported in Vault`);
      }
      
      // Check if Router is authorized executor
      const isAuthorized = await contracts.vault.isExecutor(contracts.router.target);
      if (!isAuthorized) {
        throw new Error('Router is not authorized executor in Vault');
      }
      
      // Check user balance in Vault
      const tokenToCheck = side === 'sell' ? order.baseToken : order.quoteToken;
      const requiredAmount = side === 'sell' ? 
        order.baseAmount : 
        (order.baseAmount * order.price) / (10n ** 18n);
      
      const availableBalance = await contracts.vault.getAvailableBalance(account, tokenToCheck);
      
      if (availableBalance < requiredAmount) {
        const deficit = requiredAmount - availableBalance;
        
        // Check wallet balance first
          const tokenContract = new ethers.Contract(tokenToCheck, [
          "function balanceOf(address) view returns (uint256)",
          "function allowance(address, address) view returns (uint256)",
          "function approve(address, uint256) returns (bool)"
          ], signer);
          
          const walletBalance = await tokenContract.balanceOf(account);
          
          if (walletBalance < deficit) {
          throw new Error(`Insufficient wallet balance. Need ${ethers.formatUnits(deficit, 18)} more tokens in wallet`);
          }
          
          // Check allowance
          const allowance = await tokenContract.allowance(account, contracts.vault.target);
          
          if (allowance < deficit) {
            const approveTx = await tokenContract.approve(contracts.vault.target, deficit);
            await approveTx.wait();
          }
          
          // Deposit to Vault
          const depositTx = await contracts.vault.deposit(tokenToCheck, deficit);
          await depositTx.wait();
      }

      // Submit to Router using useContracts hook
      const tx = await placeLimitOrder(order, signature);

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
      
      const tickSizeBigInt = BigInt(tickSize);
      const pairAddress = await contracts.factory.getClobPair(baseTokenAddress, quoteTokenAddress, tickSizeBigInt);
      
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





  const debugMatchingEngine = async () => {
    if (!baseTokenAddress || !quoteTokenAddress || !tickSize || !contracts) {
      toast({
        title: "Cannot Debug",
        description: "Please fill all fields first",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);
      console.log('🔍 ===== MATCHING ENGINE DEBUG =====');
      
      // Get pair address
      const tickSizeBigInt = BigInt(tickSize);
      const pairAddress = await contracts.factory.getClobPair(baseTokenAddress, quoteTokenAddress, tickSizeBigInt);
      
      if (pairAddress === ethers.ZeroAddress) {
        console.log('❌ No pair found');
        return;
      }

      console.log('📍 ClobPair address:', pairAddress);

      // Create ClobPair contract instance
      const clobPairABI = [
        "function getBestBid() external view returns (uint256 price, uint64 amount)",
        "function getBestAsk() external view returns (uint256 price, uint64 amount)",
        "function getOrderInfo(bytes32 orderHash) external view returns (tuple(uint8 status, uint64 filledAmount, uint64 remainingAmount))",
        "function getUserOrders(address user) external view returns (bytes32[] memory)",
        "function orderHashToId(bytes32) external view returns (uint64)",
        "function orderIsBid(uint64) external view returns (bool)",
        "function orderTickIndex(uint64) external view returns (uint256)",
        "event OrderPlaced(bytes32 indexed orderHash, tuple(address maker, address baseToken, address quoteToken, uint64 baseAmount, uint256 price, bool isSellBase, uint256 expiry, uint256 nonce) order, uint64 orderId)",
        "event OrderMatched(bytes32 indexed takerOrderHash, bytes32 indexed makerOrderHash, address indexed taker, address maker, uint64 baseAmount, uint256 price)"
      ];
      
      const clobPair = new ethers.Contract(pairAddress, clobPairABI, provider);

      // 1. Check best bid/ask
      console.log('📊 --- ORDER BOOK STATE ---');
      try {
        const [bestBidPrice, bestBidAmount] = await clobPair.getBestBid();
        console.log('🟢 Best BID:', {
          price: ethers.formatUnits(bestBidPrice, 18),
          amount: ethers.formatUnits(bestBidAmount, 6)
        });
      } catch (e) {
        console.log('🟢 Best BID: No bids available');
      }

      try {
        const [bestAskPrice, bestAskAmount] = await clobPair.getBestAsk();
        console.log('🔴 Best ASK:', {
          price: ethers.formatUnits(bestAskPrice, 18),
          amount: ethers.formatUnits(bestAskAmount, 6)
        });
      } catch (e) {
        console.log('🔴 Best ASK: No asks available');
      }

      // 2. Get all OrderPlaced events for this pair
      console.log('📋 --- ORDER EVENTS ---');
      const orderFilter = contracts.router.filters.OrderPlaced();
      const orderEvents = await contracts.router.queryFilter(orderFilter, -2000);
      
      console.log(`📦 Total OrderPlaced events: ${orderEvents.length}`);
      
      const userOrderEvents = orderEvents.filter(event => 
        event.args[1].toLowerCase() === account.toLowerCase()
      );
      
      console.log(`👤 User orders: ${userOrderEvents.length}`);

      // 3. Check each user order status
      for (let i = 0; i < userOrderEvents.length; i++) {
        const event = userOrderEvents[i];
        const orderHash = event.args[0];
        const orderData = event.args[3];
        
        console.log(`\n📄 --- ORDER ${i + 1} ---`);
        console.log('Hash:', orderHash);
        console.log('Maker:', event.args[1]);
        console.log('ClobPair:', event.args[2]);
        console.log('Side:', orderData.isSellBase ? 'SELL' : 'BUY');
        console.log('Price:', ethers.formatUnits(orderData.price, 18));
        console.log('Amount:', ethers.formatUnits(orderData.baseAmount, 6));
        console.log('Expiry:', new Date(Number(orderData.expiry) * 1000).toLocaleString());
        
        // Check if order still exists in contract
        try {
          const orderId = await clobPair.orderHashToId(orderHash);
          if (orderId > 0) {
            console.log('✅ Order exists in contract, ID:', orderId.toString());
            const isBid = await clobPair.orderIsBid(orderId);
            const tickIndex = await clobPair.orderTickIndex(orderId);
            console.log('   Type:', isBid ? 'BID' : 'ASK');
            console.log('   TickIndex:', tickIndex.toString());
          } else {
            console.log('❌ Order NOT found in contract (matched or cancelled)');
          }
        } catch (e) {
          console.log('❌ Error checking order status:', e.message);
        }
      }

      // 4. Check for OrderMatched events
      console.log('\n🤝 --- MATCHING EVENTS ---');
      try {
        const matchFilter = clobPair.filters.OrderMatched();
        const matchEvents = await clobPair.queryFilter(matchFilter, -2000);
        console.log(`⚡ Total OrderMatched events: ${matchEvents.length}`);
        
        matchEvents.forEach((event, i) => {
          console.log(`Match ${i + 1}:`, {
            takerHash: event.args[0],
            makerHash: event.args[1],
            taker: event.args[2],
            maker: event.args[3],
            amount: ethers.formatUnits(event.args[4], 6),
            price: ethers.formatUnits(event.args[5], 18)
          });
        });
      } catch (e) {
        console.log('❌ Error fetching match events:', e.message);
      }

      console.log('\n🎯 --- MATCHING ANALYSIS ---');
      
      // Check why orders don't match
      const buyOrders = userOrderEvents.filter(e => !e.args[3].isSellBase);
      const sellOrders = userOrderEvents.filter(e => e.args[3].isSellBase);
      
      console.log(`🟢 BUY orders: ${buyOrders.length}`);
      console.log(`🔴 SELL orders: ${sellOrders.length}`);
      
      if (buyOrders.length > 0 && sellOrders.length > 0) {
        const bestBuy = buyOrders.reduce((best, current) => 
          current.args[3].price > best.args[3].price ? current : best
        );
        const bestSell = sellOrders.reduce((best, current) => 
          current.args[3].price < best.args[3].price ? current : best
        );
        
        const buyPrice = Number(ethers.formatUnits(bestBuy.args[3].price, 18));
        const sellPrice = Number(ethers.formatUnits(bestSell.args[3].price, 18));
        
        console.log(`💰 Best BUY price: ${buyPrice}`);
        console.log(`💰 Best SELL price: ${sellPrice}`);
        console.log(`📊 Spread: ${sellPrice - buyPrice}`);
        
        if (buyPrice >= sellPrice) {
          console.log('✅ SHOULD MATCH! Buy price >= Sell price');
          console.log('🤔 Possible reasons for no match:');
          console.log('   - Same maker prevention');
          console.log('   - Orders already matched');
          console.log('   - Contract bug');
        } else {
          console.log('❌ NO MATCH: Buy price < Sell price');
        }
      }

      console.log('🔍 ===== DEBUG COMPLETE =====');
      
      toast({
        title: "Debug Complete",
        description: "Check console for detailed logs",
      });

    } catch (error) {
      console.error('❌ Debug error:', error);
      toast({
        title: "Debug Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkOrderBook = async () => {
    if (!baseTokenAddress || !quoteTokenAddress || !tickSize || !contracts) {
      toast({
        title: "Cannot Check Order Book",
        description: "Please fill all fields first",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Get pair address
      const tickSizeBigInt = BigInt(tickSize);
      const pairAddress = await contracts.factory.getClobPair(baseTokenAddress, quoteTokenAddress, tickSizeBigInt);
      
      if (pairAddress === ethers.ZeroAddress) {
      toast({
          title: "No Pair Found",
          description: "Trading pair doesn't exist. Create it first.",
        variant: "destructive"
      });
      return;
    }
    
      // Enhanced ClobPair contract instance
      const clobPairABI = [
        "function getBestBid() view returns (bool exists, uint256 price, uint64 totalBase)",
        "function getBestAsk() view returns (bool exists, uint256 price, uint64 totalBase)",
        "function getPriceLevel(uint256 price) view returns (uint64 totalBase, uint64 orderCount)",
        "function getUserOrders(address user) view returns (bytes32[] memory)",
        "function getOrderInfo(bytes32 orderHash) view returns (tuple(bytes32 orderHash, uint8 status, uint256 filledBase, uint256 createdAt))",
        "function getPairInfo() view returns (address baseToken, address quoteToken, uint256 tickSize)"
      ];
      
      const clobPair = new ethers.Contract(pairAddress, clobPairABI, provider);
      
      // Comprehensive check
      const [bestBid, bestAsk, userOrders, pairInfo] = await Promise.all([
        clobPair.getBestBid(),
        clobPair.getBestAsk(),
        clobPair.getUserOrders(account),
        clobPair.getPairInfo()
      ]);
      
      console.log('📊 COMPREHENSIVE ORDER BOOK DEBUG:');
      console.log('  Pair Address:', pairAddress);
      console.log('  Pair Info:', pairInfo);
      console.log('  Best Bid:', bestBid);
      console.log('  Best Ask:', bestAsk);
      console.log('  User Orders Count:', userOrders.length);
      console.log('  User Orders:', userOrders);
      
      // Check specific price level
      const currentPrice = ethers.parseUnits(price || "2500", 18);
      try {
        const priceLevel = await clobPair.getPriceLevel(currentPrice);
        console.log(`  Price Level at ${price}:`, priceLevel);
      } catch (levelError) {
        console.log('  Price level check failed:', levelError.message);
      }
      
      // Check user's order details
      if (userOrders.length > 0) {
        console.log('📋 USER ORDER DETAILS:');
        for (let i = 0; i < Math.min(userOrders.length, 5); i++) {
          try {
            const orderInfo = await clobPair.getOrderInfo(userOrders[i]);
            console.log(`  Order ${i + 1}:`, orderInfo);
          } catch (orderError) {
            console.log(`  Order ${i + 1} info failed:`, orderError.message);
          }
        }
      }
      
      // Result message
      if (!bestBid.exists && !bestAsk.exists) {
        if (userOrders.length > 0) {
          toast({
            title: "Orders Found But Not in Book! 🤔",
            description: `You have ${userOrders.length} orders, but they're not showing in the book. They may have been filled or expired.`,
            variant: "destructive"
          });
        } else {
          toast({
            title: "Order Book Empty 📖",
            description: "No orders found. Place the first order to start trading!",
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "Order Book Found! 📊",
          description: `Bid: ${bestBid.exists ? ethers.formatUnits(bestBid.price, 18) : 'None'}, Ask: ${bestAsk.exists ? ethers.formatUnits(bestAsk.price, 18) : 'None'}. You have ${userOrders.length} orders.`,
        });
      }
      
    } catch (error) {
      console.error('Check order book failed:', error);
      toast({
        title: "Check Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkTransactionHistory = async () => {
    if (!contracts || !account) {
      toast({
        title: "Cannot Check History",
        description: "Contracts not ready or wallet not connected",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      console.log('🔍 CHECKING TRANSACTION HISTORY:');
      
      // Check Router events for this user
      const routerContract = contracts.router;
      
      // Get recent blocks (last 1000 blocks)
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 1000);
      
      console.log(`  Checking blocks ${fromBlock} to ${currentBlock}`);
      
      // Get OrderPlaced events
      const orderPlacedFilter = routerContract.filters.OrderPlaced(null, account);
      const orderPlacedEvents = await routerContract.queryFilter(orderPlacedFilter, fromBlock);
      
      // Get OrderCancelled events  
      const orderCancelledFilter = routerContract.filters.OrderCancelled(null, account);
      const orderCancelledEvents = await routerContract.queryFilter(orderCancelledFilter, fromBlock);
      
      console.log('📋 ROUTER EVENTS:');
      console.log('  OrderPlaced events:', orderPlacedEvents.length);
      console.log('  OrderCancelled events:', orderCancelledEvents.length);
      
      // Show recent events
      orderPlacedEvents.forEach((event, i) => {
        console.log(`  OrderPlaced ${i + 1}:`, {
          orderHash: event.args.orderHash,
          maker: event.args.maker,
          clobPair: event.args.clobPair,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash
        });
      });
      
      // Check if we have any pairs from factory
      const allPairs = await contracts.factory.getAllPairs();
      console.log('🏭 FACTORY INFO:');
      console.log('  Total pairs:', allPairs.length);
      console.log('  All pairs:', allPairs);
      
      // Check each pair for events
      for (const pairAddress of allPairs.slice(0, 3)) { // Check first 3 pairs
        try {
          const clobPairABI = [
            "function getUserOrders(address user) view returns (bytes32[] memory)",
            "function getPairInfo() view returns (address baseToken, address quoteToken, uint256 tickSize)"
          ];
          
          const clobPair = new ethers.Contract(pairAddress, clobPairABI, provider);
          const [userOrders, pairInfo] = await Promise.all([
            clobPair.getUserOrders(account),
            clobPair.getPairInfo()
          ]);
          
          console.log(`📊 PAIR ${pairAddress.slice(0, 8)}...:`);
          console.log('  Pair Info:', pairInfo);
          console.log('  Your Orders:', userOrders.length);
          
          if (userOrders.length > 0) {
            console.log('  Order Hashes:', userOrders);
          }
          
        } catch (pairError) {
          console.log(`  Error checking pair ${pairAddress}:`, pairError.message);
        }
      }
      
      // Summary
      const totalOrders = orderPlacedEvents.length;
      const totalCancelled = orderCancelledEvents.length;
      const activeOrders = totalOrders - totalCancelled;
      
      toast({
        title: "Transaction History 📜",
        description: `Found ${totalOrders} placed orders, ${totalCancelled} cancelled. ${activeOrders} potentially active.`,
      });
      
    } catch (error) {
      console.error('Check transaction history failed:', error);
      toast({
        title: "History Check Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const setupTestEnvironment = async () => {
    if (!contracts || !account) {
      toast({
        title: "Setup Failed",
        description: "Contracts not ready or wallet not connected",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Use mock ERC20 addresses for testing (these should be deployed mock tokens)
      const mockBaseToken = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Example mock token 1
      const mockQuoteToken = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"; // Example mock token 2
      const testTickSize = "1000000000000000000"; // 1e18
      
      setBaseTokenAddress(mockBaseToken);
      setQuoteTokenAddress(mockQuoteToken);
      setTickSize(testTickSize);
      
      toast({
        title: "Test Environment Setup",
        description: "Mock tokens loaded. Now check if pair exists or create it.",
      });
      
    } catch (error) {
      console.error('Setup test environment failed:', error);
      toast({
        title: "Setup Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
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
        {/* Test Environment Setup */}
        <div className="mb-4 space-y-2">
          <Button
            onClick={setupTestEnvironment}
            disabled={!isConnected || isSubmitting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg text-sm font-medium transition-all"
          >
            🧪 Setup Test Environment
          </Button>
          <Button
            onClick={checkTransactionHistory}
            disabled={!isConnected || isSubmitting}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg text-sm font-medium transition-all"
          >
            📜 Check Transaction History
          </Button>
          <Button
            onClick={debugMatchingEngine}
            disabled={!isConnected || isSubmitting}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg text-sm font-medium transition-all"
          >
            🔍 Debug Matching Engine
          </Button>
          <p className="text-xs text-slate-400 mt-1 text-center">
            Debug tools for testing
          </p>
        </div>

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
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-medium transition-all"
            >
              {isCheckingPair ? 'Checking...' : 'Check Pair'}
            </Button>
            <Button
              onClick={checkOrderBook}
              disabled={isSubmitting || !isConnected}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-xs font-medium transition-all"
            >
              📊 Order Book
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