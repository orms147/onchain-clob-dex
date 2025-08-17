import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, BarChart3, Maximize2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const PriceChart = ({ selectedPair, currentPrice }) => {
  const [timeframe, setTimeframe] = useState('1H');
  const [chartType, setChartType] = useState('candlestick');
  const [priceData, setPriceData] = useState([]);
  const canvasRef = useRef(null);

  const timeframes = ['1M', '5M', '15M', '1H', '4H', '1D', '1W'];

  useEffect(() => {
    // Generate mock price data
    const generatePriceData = () => {
      const data = [];
      let price = currentPrice;
      const now = Date.now();
      const intervals = timeframe === '1M' ? 60 : timeframe === '5M' ? 300 : 
                       timeframe === '15M' ? 900 : timeframe === '1H' ? 3600 :
                       timeframe === '4H' ? 14400 : timeframe === '1D' ? 86400 : 604800;
      
      for (let i = 100; i >= 0; i--) {
        const timestamp = now - (i * intervals * 1000);
        const volatility = 50;
        const change = (Math.random() - 0.5) * volatility;
        
        const open = price;
        const high = open + Math.random() * volatility * 0.5;
        const low = open - Math.random() * volatility * 0.5;
        const close = open + change;
        
        price = close;
        
        data.push({
          timestamp,
          open: Math.max(0, open),
          high: Math.max(0, high),
          low: Math.max(0, low),
          close: Math.max(0, close),
          volume: Math.random() * 1000 + 100
        });
      }
      return data;
    };

    setPriceData(generatePriceData());
  }, [selectedPair, currentPrice, timeframe]);

  useEffect(() => {
    if (!canvasRef.current || priceData.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    // Set canvas size for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    if (priceData.length === 0) return;

    // Calculate price range
    const prices = priceData.flatMap(d => [d.open, d.high, d.low, d.close]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const padding = priceRange * 0.1;

    // Chart dimensions
    const chartPadding = { top: 20, right: 60, bottom: 40, left: 20 };
    const chartWidth = rect.width - chartPadding.left - chartPadding.right;
    const chartHeight = rect.height - chartPadding.top - chartPadding.bottom;

    // Helper functions
    const xScale = (index) => chartPadding.left + (index / (priceData.length - 1)) * chartWidth;
    const yScale = (price) => chartPadding.top + ((maxPrice + padding - price) / (priceRange + 2 * padding)) * chartHeight;
    const candleWidth = Math.max(2, chartWidth / priceData.length * 0.8);

    if (chartType === 'candlestick') {
      // Draw candlesticks
      priceData.forEach((data, index) => {
        const x = xScale(index);
        const openY = yScale(data.open);
        const highY = yScale(data.high);
        const lowY = yScale(data.low);
        const closeY = yScale(data.close);
        
        const isGreen = data.close >= data.open;
        ctx.strokeStyle = isGreen ? '#22c55e' : '#ef4444';
        ctx.fillStyle = isGreen ? '#22c55e' : '#ef4444';
        
        // Draw wick
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();
        
        // Draw body
        const bodyHeight = Math.abs(closeY - openY);
        const bodyY = Math.min(openY, closeY);
        
        if (isGreen) {
          ctx.fillRect(x - candleWidth/2, bodyY, candleWidth, bodyHeight);
        } else {
          ctx.strokeRect(x - candleWidth/2, bodyY, candleWidth, bodyHeight);
        }
      });
    } else {
      // Draw line chart
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      priceData.forEach((data, index) => {
        const x = xScale(index);
        const y = yScale(data.close);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
      
      // Add gradient fill
      const gradient = ctx.createLinearGradient(0, chartPadding.top, 0, rect.height - chartPadding.bottom);
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
      
      ctx.fillStyle = gradient;
      ctx.lineTo(xScale(priceData.length - 1), rect.height - chartPadding.bottom);
      ctx.lineTo(xScale(0), rect.height - chartPadding.bottom);
      ctx.closePath();
      ctx.fill();
    }

    // Draw price labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    
    const labelCount = 5;
    for (let i = 0; i <= labelCount; i++) {
      const price = minPrice + (priceRange * i / labelCount);
      const y = yScale(price);
      ctx.fillText(`$${price.toFixed(2)}`, rect.width - 55, y + 4);
    }

    // Draw current price line
    const currentY = yScale(currentPrice);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(chartPadding.left, currentY);
    ctx.lineTo(rect.width - chartPadding.right, currentY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Current price label
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(rect.width - 55, currentY - 10, 50, 20);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.fillText(`$${currentPrice.toFixed(2)}`, rect.width - 30, currentY + 4);

  }, [priceData, chartType, currentPrice]);

  const currentChange = priceData.length > 1 ? 
    ((priceData[priceData.length - 1].close - priceData[priceData.length - 2].close) / priceData[priceData.length - 2].close * 100) : 0;

  return (
    <div className="glass-effect rounded-xl p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <BarChart3 className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">{selectedPair} Chart</h2>
          <div className={`flex items-center space-x-1 ${currentChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {currentChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span className="text-sm font-medium">
              {currentChange >= 0 ? '+' : ''}{currentChange.toFixed(2)}%
            </span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => toast({ title: "🚧 Tính năng fullscreen chưa được triển khai—nhưng đừng lo! Bạn có thể yêu cầu nó trong lần nhắc tiếp theo! 🚀" })}
            className="border-slate-600 hover:bg-slate-700"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => toast({ title: "🚧 Cài đặt biểu đồ chưa được triển khai—nhưng đừng lo! Bạn có thể yêu cầu nó trong lần nhắc tiếp theo! 🚀" })}
            className="border-slate-600 hover:bg-slate-700"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        {/* Timeframe Selector */}
        <div className="flex space-x-1 bg-slate-800/50 rounded-lg p-1">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                timeframe === tf
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Chart Type Selector */}
        <div className="flex space-x-1 bg-slate-800/50 rounded-lg p-1">
          <button
            onClick={() => setChartType('line')}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              chartType === 'line'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Line
          </button>
          <button
            onClick={() => setChartType('candlestick')}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              chartType === 'candlestick'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Candles
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 relative bg-slate-900/30 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: 'block' }}
        />
      </div>

      {/* Chart Info */}
      <div className="mt-3 grid grid-cols-4 gap-4 text-sm">
        {priceData.length > 0 && (
          <>
            <div>
              <div className="text-slate-400 text-xs">Open</div>
              <div className="text-white font-mono">${priceData[priceData.length - 1].open.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">High</div>
              <div className="text-green-400 font-mono">${Math.max(...priceData.slice(-24).map(d => d.high)).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">Low</div>
              <div className="text-red-400 font-mono">${Math.min(...priceData.slice(-24).map(d => d.low)).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">Volume</div>
              <div className="text-blue-400 font-mono">{(priceData.slice(-24).reduce((sum, d) => sum + d.volume, 0) / 1000).toFixed(1)}K</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PriceChart;
