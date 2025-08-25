// Contract addresses configuration
export const CONTRACT_ADDRESSES = {
  VAULT: import.meta.env.VITE_VAULT_ADDRESS || "",
  FACTORY: import.meta.env.VITE_FACTORY_ADDRESS || "",
  ROUTER: import.meta.env.VITE_ROUTER_ADDRESS || ""
};

// Network configuration
export const NETWORK_CONFIG = {
  // Saga Rynn (giá trị bạn đang dùng). Đổi bằng .env nếu cần.
  CHAIN_ID: parseInt(import.meta.env.VITE_CHAIN_ID || "2747220808242000", 10),
  NETWORK_NAME: import.meta.env.VITE_NETWORK_NAME || "Saga Rynn"
};

// Hex chain id for wallet_switchEthereumChain
export const CHAIN_ID_HEX = "0x9c29530651350";

// Optional helper: switch to target chain
export async function ensureSwitchChain(ethereum) {
  if (!ethereum) return;
  const current = await ethereum.request({ method: "eth_chainId" });
  if (current?.toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }]
    });
  } catch (err) {
    // You can add wallet_addEthereumChain here if needed
    throw err;
  }
}

// (UI demo data; không ảnh hưởng on-chain)
export const TOKEN_SYMBOLS = {};
export const TRADING_PAIRS = [];
export function getTradingPair(symbol) { throw new Error('UI demo only'); }
export function getTokenSymbol(addr) { return `TOKEN_${(addr||'').slice(-4)}`; }

export function validateContractAddresses() {
  const errors = [];
  if (!CONTRACT_ADDRESSES.VAULT || CONTRACT_ADDRESSES.VAULT === "0x") errors.push("Vault address is not configured");
  if (!CONTRACT_ADDRESSES.FACTORY || CONTRACT_ADDRESSES.FACTORY === "0x") errors.push("Factory address is not configured");
  if (!CONTRACT_ADDRESSES.ROUTER || CONTRACT_ADDRESSES.ROUTER === "0x") errors.push("Router address is not configured");
  return { isValid: errors.length === 0, errors };
}
