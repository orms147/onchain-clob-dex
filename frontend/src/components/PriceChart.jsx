// src/PriceChart.jsx
import { useMemo } from 'react';

const genData = (currentPrice) => {
  const now = Date.now();
  const pts = [];
  let price = currentPrice || 2200;
  for (let i = 60; i >= 0; i--) {
    price += (Math.random() - 0.5) * 10;
    pts.push({ t: new Date(now - i * 60_000), p: Math.max(1, price) });
  }
  return pts;
};

const PriceChart = ({ currentPrice }) => {
  const data = useMemo(() => genData(currentPrice), [currentPrice]);

  // Simple lightweight chart-less view (giữ UI sạch sẽ). Nếu muốn dùng chart lib, ta add sau.
  const last = data[data.length - 1]?.p ?? 0;
  const min = Math.min(...data.slice(-24).map(d => d.p));
  const max = Math.max(...data.slice(-24).map(d => d.p));

  return (
    <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">Price (last 1h)</h3>
        <div className="text-xs text-slate-400">Now: ${last.toFixed(2)} · 24pts Range: ${min.toFixed(2)} – ${max.toFixed(2)}</div>
      </div>

      <div className="h-40 w-full rounded-md bg-slate-800/40 border border-slate-700/50 flex items-center justify-center text-slate-400 text-xs">
        (Chart placeholder)
      </div>
    </div>
  );
};

export default PriceChart;
