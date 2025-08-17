// Contract addresses configuration
export const CONTRACT_ADDRESSES = {
  VAULT: import.meta.env.VITE_VAULT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  FACTORY: import.meta.env.VITE_FACTORY_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", 
  ROUTER: import.meta.env.VITE_ROUTER_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
};

// Token addresses configuration
export const TOKEN_ADDRESSES = {
  ETH: import.meta.env.VITE_ETH_TOKEN_ADDRESS || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  USDC: import.meta.env.VITE_USDC_TOKEN_ADDRESS || "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  BTC: import.meta.env.VITE_BTC_TOKEN_ADDRESS || "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  LINK: import.meta.env.VITE_LINK_TOKEN_ADDRESS || "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  UNI: import.meta.env.VITE_UNI_TOKEN_ADDRESS || "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"
};

// Network configuration
export const NETWORK_CONFIG = {
  CHAIN_ID: parseInt(import.meta.env.VITE_CHAIN_ID || "31337"),
  NETWORK_NAME: import.meta.env.VITE_NETWORK_NAME || "localhost"
};

// Trading pairs configuration
export const TRADING_PAIRS = [
  { symbol: 'ETH/USDC', baseToken: 'ETH', quoteToken: 'USDC' },
  { symbol: 'BTC/USDC', baseToken: 'BTC', quoteToken: 'USDC' },
  { symbol: 'LINK/USDC', baseToken: 'LINK', quoteToken: 'USDC' },
  { symbol: 'UNI/USDC', baseToken: 'UNI', quoteToken: 'USDC' }
];

// Get token address by symbol
export function getTokenAddress(symbol: string): string {
  const address = TOKEN_ADDRESSES[symbol as keyof typeof TOKEN_ADDRESSES];
  if (!address) {
    throw new Error(`Token address not found for symbol: ${symbol}`);
  }
  return address;
}

// Get trading pair configuration
export function getTradingPair(pairSymbol: string) {
  const pair = TRADING_PAIRS.find(p => p.symbol === pairSymbol);
  if (!pair) {
    throw new Error(`Trading pair not found: ${pairSymbol}`);
  }
  return pair;
}

// Validate contract addresses
export function validateContractAddresses(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!CONTRACT_ADDRESSES.VAULT || CONTRACT_ADDRESSES.VAULT === "0x") {
    errors.push("Vault address is not configured");
  }
  
  if (!CONTRACT_ADDRESSES.FACTORY || CONTRACT_ADDRESSES.FACTORY === "0x") {
    errors.push("Factory address is not configured");
  }
  
  if (!CONTRACT_ADDRESSES.ROUTER || CONTRACT_ADDRESSES.ROUTER === "0x") {
    errors.push("Router address is not configured");
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
