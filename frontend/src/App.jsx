import React from 'react';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import TradingDashboard from '@/components/TradingDashboard';

function App() {
  return (
    <>
      <Helmet>
        <title>DEX Limit Order Book - Advanced Trading Platform</title>
        <meta name="description" content="Professional on-chain DEX limit order book with real-time trading, advanced order management, and comprehensive market analytics." />
        <meta property="og:title" content="DEX Limit Order Book - Advanced Trading Platform" />
        <meta property="og:description" content="Professional on-chain DEX limit order book with real-time trading, advanced order management, and comprehensive market analytics." />
      </Helmet>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900">
        <TradingDashboard />
        <Toaster />
      </div>
    </>
  );
}

export default App;