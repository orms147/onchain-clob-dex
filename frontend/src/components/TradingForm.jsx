// src/components/TradingForm.jsx
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useWeb3 } from '@/hooks/useWeb3';
import { useContracts } from '@/hooks/useContracts';

/**
 * Simple limit-order form that always uses the selected ClobPair.
 * It auto-reads base/quote from on-chain, and places order via Router.
 * Price is 18-dec fixed (quote per 1 base). Amount is in base token units (human).
 */
const TradingForm = ({ pairAddress }) => {
  const { account, signer } = useWeb3();
  const { placeLimitOrder, getPairInfo, getDecimals } = useContracts(signer);

  const [side, setSide] = useState('buy'); // 'buy' | 'sell'
  const [price, setPrice] = useState('');  // human string, 18-dec
  const [amount, setAmount] = useState(''); // human string in base decimals

  const [baseToken, setBaseToken] = useState('');
  const [quoteToken, setQuoteToken] = useState('');
  const [baseDecimals, setBaseDecimals] = useState(18);
  const [tickSize, setTickSize] = useState(0n);

  useEffect(() => {
    (async () => {
      if (!pairAddress) { setBaseToken(''); setQuoteToken(''); return; }
      try {
        const info = await getPairInfo(pairAddress);
        setBaseToken(info.base);
        setQuoteToken(info.quote);
        setTickSize(info.tickSize);
        try {
          const dec = await getDecimals(info.base);
          setBaseDecimals(dec || 18);
        } catch { setBaseDecimals(18); }
      } catch (e) {
        console.error("load pair info failed:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairAddress]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!account) return;

    if (!price || Number(price) <= 0) {
      alert('Enter a positive price');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      alert('Enter a positive amount');
      return;
    }
    if (!baseToken || !quoteToken) {
      alert('Pair not ready');
      return;
    }

    try {
      await placeLimitOrder({
        maker: account,
        baseToken,
        quoteToken,
        baseAmountHuman: amount,
        baseDecimals,
        priceHuman: price,          // 18-dec fixed
        isSellBase: side === 'sell',
        autoFund: true,
        usePermit: true
      });
      // Clear amount; keep price for convenience
      setAmount('');
    } catch (e) {
      console.error("place order failed:", e);
      // toast đã hiển thị trong hook; ở đây giữ yên
    }
  };

  return (
    <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Button
          variant={side === 'buy' ? 'default' : 'secondary'}
          className={`h-8 px-4 ${side === 'buy' ? '' : 'opacity-60'}`}
          onClick={() => setSide('buy')}
        >
          Buy
        </Button>
        <Button
          variant={side === 'sell' ? 'default' : 'secondary'}
          className={`h-8 px-4 ${side === 'sell' ? '' : 'opacity-60'}`}
          onClick={() => setSide('sell')}
        >
          Sell
        </Button>
        <div className="ml-auto text-xs text-slate-400">
          tickSize: {tickSize.toString()}
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <div className="text-xs text-slate-400 mb-1">Base token</div>
          <input
            readOnly
            value={baseToken || ''}
            className="w-full bg-slate-800/60 rounded px-3 py-2 text-sm text-white"
          />
        </div>

        <div>
          <div className="text-xs text-slate-400 mb-1">Quote token</div>
          <input
            readOnly
            value={quoteToken || ''}
            className="w-full bg-slate-800/60 rounded px-3 py-2 text-sm text-white"
          />
        </div>

        <div>
          <div className="text-xs text-slate-400 mb-1">Price (quote per 1 base, 18-dec)</div>
          <input
            placeholder="e.g. 1.0"
            value={price}
            onChange={(e)=>setPrice(e.target.value)}
            className="w-full bg-slate-800/60 rounded px-3 py-2 text-sm text-white"
          />
        </div>

        <div>
          <div className="text-xs text-slate-400 mb-1">Amount (base token)</div>
          <input
            placeholder="e.g. 2"
            value={amount}
            onChange={(e)=>setAmount(e.target.value)}
            className="w-full bg-slate-800/60 rounded px-3 py-2 text-sm text-white"
          />
        </div>

        <Button type="submit" className="w-full h-9 mt-2">
          Submit Order
        </Button>
      </form>
    </div>
  );
};

export default TradingForm;
