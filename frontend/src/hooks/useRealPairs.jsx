import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const PAIR_ABI = [
  "function getPairInfo() view returns (address,address,uint256)",
  "function getBestBid() view returns (bool,uint256,uint64)",
  "function getBestAsk() view returns (bool,uint256,uint64)"
];

export const useRealPairs = (contracts, provider) => {
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchPairs = async () => {
    if (!contracts?.factory || !provider) { setPairs([]); return; }
    try {
      setLoading(true);
      const addrs = await contracts.factory.getAllPairs();
      const out = [];
      for (const addr of addrs) {
        try {
          const cp = new ethers.Contract(addr, PAIR_ABI, provider);
          const [base, quote, tick] = await cp.getPairInfo();
          const [hasBid, bidPrice, bidQty] = await cp.getBestBid();
          const [hasAsk, askPrice, askQty] = await cp.getBestAsk();
          out.push({
            pairAddress: addr,
            baseTokenAddress: base,
            quoteTokenAddress: quote,
            tickSize: tick,                       // uint256
            bestBid: hasBid ? { price: bidPrice, qty: bidQty } : null,
            bestAsk: hasAsk ? { price: askPrice, qty: askQty } : null
          });
        } catch (e) {
          console.error("pair read error", addr, e);
        }
      }
      setPairs(out);
    } catch (e) {
      console.error(e);
      setPairs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPairs(); /* eslint-disable-next-line */ }, [contracts?.factory, provider]);

  return { pairs, loading, refresh: fetchPairs };
};
