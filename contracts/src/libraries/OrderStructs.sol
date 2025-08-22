// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title OrderStructs
 * @notice Contains all order-related data structures for the CLOB DEX
 * @dev Simplified LimitOrder to remove redundant fields (quoteAmount, tickSize, salt) and add FILLED status.
 */
library OrderStructs {
    uint256 internal constant PRICE_SCALE = 1e18;

    bytes32 internal constant LIMIT_ORDER_TYPEHASH = keccak256(
        "LimitOrder(address maker,address baseToken,address quoteToken,uint64 baseAmount,uint256 price,bool isSellBase,uint256 expiry,uint256 nonce)"
    );

    bytes32 internal constant CANCEL_ORDER_TYPEHASH = keccak256(
        "CancelOrder(bytes32 orderHash,uint256 nonce)"
    );
    /**
     * @notice Enum for order status lifecycle
     * @dev FILLED is separated instead of inferred for clearer indexer UX
     */
    enum OrderStatus {
        PENDING,            // Created and resting on the book with no fill
        PARTIALLY_FILLED,   // Partially filled, still active
        FILLED,             // Fully filled (terminal)
        CANCELLED,          // Cancelled by maker (terminal)
        EXPIRED             // Expired by time (terminal)
    }

    /**
     * @notice Structure representing a limit order (EIP-712 signed)
     * @dev Redundancy removed: quoteAmount = baseAmount * price / PRICE_SCALE can be derived off-chain.
     * @dev tickSize should be enforced per pair (not user-signed) to avoid mismatch.
     * @dev price is an integer in quote token units scaled by PRICE_SCALE (to be defined in the pair / router).
     */
    struct LimitOrder {
        address maker;        // Order creator
        address baseToken;    // Base token (canonical lower address enforced off-chain / factory)
        address quoteToken;   // Quote token
        uint64 baseAmount;    // Amount of base the maker wants to trade (full size) 
        uint256 price;        // Scaled price: quote per 1 base * PRICE_SCALE
        bool isSellBase;      // true -> sell base / receive quote, false -> buy base / spend quote
        uint256 expiry;        // Expiration timestamp (unix seconds)
        uint256 nonce;         // User nonce (replay protection / cancellation domain)
    }

    /**
     * @notice Structure representing order status and fill information
     * @dev filledBase tracks how much base amount has been executed. Remaining = baseAmount - filledBase
     */
    struct OrderInfo {
        bytes32 orderHash;      // Hash of the order (EIP-712 digest)
        OrderStatus status;     // Current order status
        uint256 filledBase;     // Filled base token amount
        uint256 createdAt;      // Block timestamp at creation
    }
}
