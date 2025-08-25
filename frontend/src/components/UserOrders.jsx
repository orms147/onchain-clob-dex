import { useEffect, useState } from 'react';
import { ethers } from 'ethers';

const PAIR_ABI = [
  "function getUserOrders(address) view returns (bytes32[])",
  "function getOrderDetails(bytes32) view returns (bool,bool,uint256,uint64,address)"
];

const UserOrders = ({ factory, provider, user }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!factory || !provider || !user) { setOrders([]); return; }
    try {
      setLoading(true);
      const pairs = await factory.getAllPairs();
      const out = [];
      for (const p of pairs) {
        const cp = new ethers.Contract(p, PAIR_ABI, provider);
        const hashes = await cp.getUserOrders(user);
        for (const h of hashes) {
          const [exists, isBid, price, remaining, maker] = await cp.getOrderDetails(h);
          out.push({ pair: p, hash: h, exists, isBid, price, remaining, maker });
        }
      }
      setOrders(out);
    } catch (e) {
      console.error(e); setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [factory, provider, user]);

  if (!user) return null;
  return (
    <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">Your Open Orders</h3>
        <button className="text-xs text-sky-400" onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
      </div>
      <div className="space-y-2">
        {orders.length === 0 ? <div className="text-slate-500 text-sm">No open orders</div> :
          orders.map(o => (
            <div key={o.hash} className="text-xs text-slate-300 border border-slate-700/50 rounded p-2">
              <div>Pair: {o.pair}</div>
              <div>Hash: {o.hash}</div>
              <div>Side: {o.isBid ? 'BUY' : 'SELL'}</div>
              <div>Price: {o.price.toString()}</div>
              <div>Remaining: {o.remaining.toString()}</div>
            </div>
          ))
        }
      </div>
    </div>
  );
};

export default UserOrders;
