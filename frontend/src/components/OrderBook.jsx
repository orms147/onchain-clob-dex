// src/components/OrderBook.jsx
import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { Button } from '@/components/ui/button';
import { useWeb3 } from '@/hooks/useWeb3';
import { useContracts } from '@/hooks/useContracts';

function format18(x) {
  try { return ethers.formatUnits(x, 18); } catch { return x?.toString?.() ?? String(x); }
}
function formatQty(x, decimals = 18) {
  try { return ethers.formatUnits(x, decimals); } catch { return x?.toString?.() ?? String(x); }
}

const OrderBook = ({ pairAddress }) => {
  const { signer } = useWeb3();
  const { getOrderBookDepth, getDecimals, getPairInfo } = useContracts(signer);

  const [bids, setBids] = useState([]);
  const [asks, setAsks] = useState([]);
  const [tickSize, setTickSize] = useState(0n);
  const [baseDecimals, setBaseDecimals] = useState(18);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!pairAddress) { setBids([]); setAsks([]); return; }
    try {
      setLoading(true);
      const info = await getPairInfo(pairAddress);
      setTickSize(info.tickSize);
      try {
        const dec = await getDecimals(info.base);
        setBaseDecimals(dec || 18);
      } catch { setBaseDecimals(18); }

      const { bids, asks } = await getOrderBookDepth(pairAddress, {
        startPrice: 0n,
        endPrice: info.tickSize * 32767n,
        filterZero: true
      });
      setBids(bids);
      setAsks(asks);
    } catch (e) {
      console.error("load orderbook failed:", e);
      setBids([]); setAsks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pairAddress]);

  return (
    <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Order Book (full depth)</h3>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400">tickSize: {tickSize.toString()}</div>
          <Button onClick={load} disabled={loading} className="h-7 px-3 text-xs">
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Asks: low -> high */}
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <div className="bg-slate-800/50 text-red-300 text-xs px-3 py-2 font-semibold">Asks</div>
          <div className="max-h-96 overflow-auto text-xs">
            <div className="grid grid-cols-2 px-3 py-2 text-slate-400">
              <div>Price (quote/base)</div>
              <div className="text-right">Qty (base)</div>
            </div>
            {asks.length === 0 ? (
              <div className="px-3 py-2 text-slate-500">No asks</div>
            ) : asks.map((l, i) => (
              <div key={`ask-${l.price.toString()}-${i}`} className="grid grid-cols-2 px-3 py-1.5 text-slate-200">
                <div className="text-red-400">{format18(l.price)}</div>
                <div className="text-right">{formatQty(l.askQty, baseDecimals)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bids: high -> low */}
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <div className="bg-slate-800/50 text-green-300 text-xs px-3 py-2 font-semibold">Bids</div>
          <div className="max-h-96 overflow-auto text-xs">
            <div className="grid grid-cols-2 px-3 py-2 text-slate-400">
              <div>Price (quote/base)</div>
              <div className="text-right">Qty (base)</div>
            </div>
            {bids.length === 0 ? (
              <div className="px-3 py-2 text-slate-500">No bids</div>
            ) : bids.map((l, i) => (
              <div key={`bid-${l.price.toString()}-${i}`} className="grid grid-cols-2 px-3 py-1.5 text-slate-200">
                <div className="text-green-400">{format18(l.price)}</div>
                <div className="text-right">{formatQty(l.bidQty, baseDecimals)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderBook;
