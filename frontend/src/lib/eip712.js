import { ethers } from 'ethers';

// EIP-712 type definitions (must match Router.sol)
export const LIMIT_ORDER_TYPES = {
  LimitOrder: [
    { name: 'maker', type: 'address' },
    { name: 'baseToken', type: 'address' },
    { name: 'quoteToken', type: 'address' },
    { name: 'baseAmount', type: 'uint64' },
    { name: 'price', type: 'uint256' },
    { name: 'isSellBase', type: 'bool' },
    { name: 'expiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' }
  ]
};

export const CANCEL_ORDER_TYPES = {
  CancelOrder: [
    { name: 'orderHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' }
  ]
};

export function createDomain(chainId, routerAddress) {
  return { name: 'ClobRouter', version: '1', chainId, verifyingContract: routerAddress };
}

/** Parse human amount -> raw units (with token decimals) and ensure uint64 bound */
export function parseTokenAmount(amountStr, decimals) {
  const raw = ethers.parseUnits(amountStr, decimals);
  const MAX_UINT64 = (1n << 64n) - 1n;
  if (raw > MAX_UINT64) {
    throw new Error(`Amount exceeds uint64: ${raw.toString()}`);
  }
  return raw;
}

/** Build LimitOrder with raw baseAmount (already parsed) and 18-decimal price */
export function createLimitOrder({
  maker, baseToken, quoteToken,
  baseAmountRaw,               // BigInt parsed with token decimals
  priceHuman,                  // string -> parseUnits(,18)
  isSellBase,
  expiry = 0,                  // seconds (0 => no expiry)
  nonce = 0n
}) {
  return {
    maker,
    baseToken,
    quoteToken,
    baseAmount: baseAmountRaw,
    price: ethers.parseUnits(priceHuman, 18),
    isSellBase,
    expiry: BigInt(expiry),
    nonce
  };
}

export async function signLimitOrder(signer, order, domain) {
  // ethers v6 expects stringified BigInt for typed data
  const orderForSigning = {
    maker: order.maker,
    baseToken: order.baseToken,
    quoteToken: order.quoteToken,
    baseAmount: order.baseAmount.toString(),
    price: order.price.toString(),
    isSellBase: order.isSellBase,
    expiry: order.expiry.toString(),
    nonce: order.nonce.toString()
  };
  return await signer.signTypedData(domain, LIMIT_ORDER_TYPES, orderForSigning);
}

export async function signCancelOrder(signer, orderHash, nonce, domain) {
  return await signer.signTypedData(domain, CANCEL_ORDER_TYPES, { orderHash, nonce: nonce.toString() });
}

export function validateOrder(order) {
  if (!order?.maker) return { isValid: false, error: "Invalid maker" };
  if (!order?.baseToken || !order?.quoteToken) return { isValid: false, error: "Invalid token" };
  if (order.baseToken.toLowerCase() === order.quoteToken.toLowerCase()) return { isValid: false, error: "Same tokens" };
  if (order.baseAmount <= 0n) return { isValid: false, error: "Amount must be > 0" };
  if (order.price <= 0n) return { isValid: false, error: "Price must be > 0" };
  if (order.expiry !== 0n && order.expiry <= BigInt(Math.floor(Date.now()/1000))) return { isValid: false, error: "Expired" };
  return { isValid: true };
}

export function getOrderExpiry(minutesFromNow = 60) {
  return Math.floor(Date.now() / 1000) + minutesFromNow * 60;
}
