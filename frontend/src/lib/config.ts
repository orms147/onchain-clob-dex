// Contract addresses configuration
export const CONTRACT_ADDRESSES = {
  VAULT: import.meta.env.VITE_VAULT_ADDRESS || "0x3824dAa3dc31De43B594c8D231347023Ab61D48f",
  FACTORY: import.meta.env.VITE_FACTORY_ADDRESS || "0x0367709cA277f50095BB42Bf4c9426CDb2C98EDb", 
  ROUTER: import.meta.env.VITE_ROUTER_ADDRESS || "0x274035DDFFF3D88Bd752604E44095B1Cf4f7Da1F"
};

// Token address to symbol mapping - ADD YOUR TOKENS HERE
export const TOKEN_SYMBOLS = {
  // Add your actual token addresses and symbols here
  // Example:
  // "0x1234...": "ETH",
  // "0x5678...": "USDC",
  // "0x9abc...": "BTC"
};

// Network configuration
export const NETWORK_CONFIG = {
  CHAIN_ID: parseInt(import.meta.env.VITE_CHAIN_ID || "31337"),
  NETWORK_NAME: import.meta.env.VITE_NETWORK_NAME || "localhost"
};

// Trading pairs configuration - only for UI display
export const TRADING_PAIRS = [
  { symbol: 'ETH/USDC', baseToken: 'ETH', quoteToken: 'USDC', price: 2456.78, change: 2.34 },
  { symbol: 'BTC/USDC', baseToken: 'BTC', quoteToken: 'USDC', price: 43250.12, change: -1.23 },
  { symbol: 'LINK/USDC', baseToken: 'LINK', quoteToken: 'USDC', price: 14.56, change: 5.67 },
  { symbol: 'UNI/USDC', baseToken: 'UNI', quoteToken: 'USDC', price: 6.78, change: -0.89 }
];

// Get trading pair configuration
export function getTradingPair(pairSymbol: string) {
  const pair = TRADING_PAIRS.find(p => p.symbol === pairSymbol);
  if (!pair) {
    throw new Error(`Trading pair not found: ${pairSymbol}`);
  }
  return pair;
}

// Get token symbol from address
export function getTokenSymbol(address: string): string {
  const symbol = TOKEN_SYMBOLS[address.toLowerCase() as keyof typeof TOKEN_SYMBOLS];
  return symbol || `TOKEN_${address.slice(-4).toUpperCase()}`;
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