import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getTokenSymbol } from '../lib/config';

export const useRealPairs = (contracts: any, provider: any) => {
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchPairs = async () => {
    if (!contracts?.factory || !provider) {
      console.log('❌ Missing factory contract or provider');
      console.log('  Factory:', !!contracts?.factory);
      console.log('  Provider:', !!provider);
      setPairs([]);
      return;
    }

    try {
      setLoading(true);
      console.log('🔍 Fetching pairs from Factory...');

      // Get all pairs from factory
      const allPairAddresses = await contracts.factory.getAllPairs();
      console.log('📋 Found pairs:', allPairAddresses.length);
      
      if (allPairAddresses.length === 0) {
        console.log('❌ No pairs found in Factory');
        setPairs([]);
        return;
      }

      const pairData = [];
      
      for (const pairAddress of allPairAddresses) {
        try {
          console.log(`🔗 Processing pair: ${pairAddress}`);
          
          // Create ClobPair contract instance
          const clobPair = new ethers.Contract(pairAddress, [
            "function baseToken() view returns (address)",
            "function quoteToken() view returns (address)"
          ], provider);

          // Get token addresses
          const [baseTokenAddr, quoteTokenAddr] = await Promise.all([
            clobPair.baseToken(),
            clobPair.quoteToken()
          ]);

          console.log(`  Base: ${baseTokenAddr}, Quote: ${quoteTokenAddr}`);

          // Get token symbols with error handling
          let baseSymbol = 'TOKEN1';
          let quoteSymbol = 'TOKEN2';
          
          try {
            const baseContract = new ethers.Contract(baseTokenAddr, ERC20_ABI, provider);
            const quoteContract = new ethers.Contract(quoteTokenAddr, ERC20_ABI, provider);
            
            const [base, quote] = await Promise.all([
              baseContract.symbol().catch(() => `TOKEN_${baseTokenAddr.slice(-4)}`),
              quoteContract.symbol().catch(() => `TOKEN_${quoteTokenAddr.slice(-4)}`)
            ]);
            
            baseSymbol = base;
            quoteSymbol = quote;
          } catch (error) {
            console.warn(`  ⚠️ Could not fetch symbols, using fallback names`);
            baseSymbol = `TOKEN_${baseTokenAddr.slice(-4)}`;
            quoteSymbol = `TOKEN_${quoteTokenAddr.slice(-4)}`;
          }

          console.log(`  Symbols: ${baseSymbol}/${quoteSymbol}`);

          pairData.push({
            symbol: `${baseSymbol}/${quoteSymbol}`,
            baseToken: baseSymbol,
            quoteToken: quoteSymbol,
            baseTokenAddress: baseTokenAddr,
            quoteTokenAddress: quoteTokenAddr,
            pairAddress: pairAddress
          });
        } catch (error) {
          console.error(`❌ Error fetching pair data for ${pairAddress}:`, error);
        }
      }

      console.log('✅ Successfully loaded pairs:', pairData);
      setPairs(pairData);
    } catch (error) {
      console.error('❌ Error fetching pairs:', error);
      setPairs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPairs();
  }, [contracts, provider]);

  return {
    pairs,
    loading,
    refetch: fetchPairs
  };
};
