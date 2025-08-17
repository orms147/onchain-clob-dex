import { ethers } from 'ethers';

export type LimitOrder = {
    maker: string;
    baseToken: string;
    quoteToken: string;
    baseAmount: bigint;
    price: bigint;
    isSellBase: boolean;
    expiry: bigint;
    nonce: bigint;
};

export type EIP712Domain = {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
};

// EIP-712 type definitions matching the smart contract
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

/**
 * Create EIP-712 domain for the Router contract
 */
export function createDomain(chainId: number, routerAddress: string): EIP712Domain {
    return {
        name: 'ClobRouter',
        version: '1',
        chainId,
        verifyingContract: routerAddress
    };
}

/**
 * Sign a limit order using EIP-712
 */
export async function signLimitOrder(
    signer: ethers.Signer,
    order: LimitOrder,
    domain: EIP712Domain
): Promise<string> {
    // Convert BigInt values to strings for signing
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

/**
 * Sign a cancel order using EIP-712
 */
export async function signCancelOrder(
    signer: ethers.Signer,
    orderHash: string,
    nonce: bigint,
    domain: EIP712Domain
): Promise<string> {
    const cancelOrder = {
        orderHash,
        nonce: nonce.toString()
    };

    return await signer.signTypedData(domain, CANCEL_ORDER_TYPES, cancelOrder);
}

/**
 * Create a limit order struct
 */
export function createLimitOrder(
    maker: string,
    baseToken: string,
    quoteToken: string,
    baseAmount: string,
    price: string,
    isSellBase: boolean,
    expiry: number = 0,
    nonce: bigint = 0n
): LimitOrder {
    return {
        maker,
        baseToken,
        quoteToken,
        baseAmount: ethers.parseUnits(baseAmount, 6), // Assuming 6 decimals for base amount (uint64)
        price: ethers.parseUnits(price, 18), // Price with 18 decimals
        isSellBase,
        expiry: BigInt(expiry),
        nonce
    };
}

/**
 * Parse token amount with proper decimals
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
    return ethers.parseUnits(amount, decimals);
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
    return ethers.formatUnits(amount, decimals);
}

/**
 * Calculate price with proper scaling
 * Price is stored as: quote per 1 base * PRICE_SCALE
 */
export function calculatePrice(quoteAmount: string, baseAmount: string): bigint {
    const quote = ethers.parseUnits(quoteAmount, 18);
    const base = ethers.parseUnits(baseAmount, 18);
    
    // Price = quote / base * PRICE_SCALE
    // Using 18 decimals as PRICE_SCALE
    return (quote * ethers.parseUnits("1", 18)) / base;
}

/**
 * Get current timestamp for order expiry
 */
export function getOrderExpiry(minutesFromNow: number = 60): number {
    return Math.floor(Date.now() / 1000) + (minutesFromNow * 60);
}

/**
 * Validate order parameters
 */
export function validateOrder(order: LimitOrder): { isValid: boolean; error?: string } {
    if (order.maker === ethers.ZeroAddress) {
        return { isValid: false, error: "Invalid maker address" };
    }
    
    if (order.baseToken === ethers.ZeroAddress || order.quoteToken === ethers.ZeroAddress) {
        return { isValid: false, error: "Invalid token addresses" };
    }
    
    if (order.baseToken === order.quoteToken) {
        return { isValid: false, error: "Base and quote tokens cannot be the same" };
    }
    
    if (order.baseAmount <= 0n) {
        return { isValid: false, error: "Base amount must be greater than 0" };
    }
    
    if (order.price <= 0n) {
        return { isValid: false, error: "Price must be greater than 0" };
    }
    
    if (order.expiry !== 0n && order.expiry <= BigInt(Math.floor(Date.now() / 1000))) {
        return { isValid: false, error: "Order has expired" };
    }
    
    return { isValid: true };
}
