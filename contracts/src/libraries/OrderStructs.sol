// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title OrderStructs
 * @notice Contains all order-related data structures for the CLOB DEX
 */
library OrderStructs {
    uint256 internal constant PRICE_SCALE = 1e18;
    uint256 internal constant MAX_BASE_AMOUNT = type(uint64).max;

    bytes32 internal constant LIMIT_ORDER_TYPEHASH = keccak256(
        "LimitOrder(address maker,address baseToken,address quoteToken,address clobPair,uint64 baseAmount,uint256 price,bool isSellBase,uint256 expiry,uint256 nonce)"
    );

    bytes32 internal constant CANCEL_ORDER_TYPEHASH = keccak256(
        "CancelOrder(bytes32 orderHash,uint256 nonce)"
    );

    enum OrderStatus {
        PENDING,            // Created and resting on the book with no fill
        PARTIALLY_FILLED,   // Partially filled, still active
        FILLED,             // Fully filled (terminal)
        CANCELLED,          // Cancelled by maker (terminal)
        EXPIRED             // Expired by time (terminal)
    }

    struct LimitOrder {
        address maker;        // Order creator
        address baseToken;    // Base token
        address quoteToken;   // Quote token
        address clobPair;     // Optional: specific ClobPair address (zero address for auto-selection)
        uint64 baseAmount;    // Amount of base to trade
        uint256 price;        // Scaled price: quote per 1 base * PRICE_SCALE
        bool isSellBase;      // true -> sell base, false -> buy base
        uint256 expiry;       // Expiration timestamp (0 for no expiry)
        uint256 nonce;        // User nonce
    }

    struct OrderInfo {
        bytes32 orderHash;      // EIP-712 hash
        OrderStatus status;     // Current status
        uint256 filledBase;     // Filled base amount
        uint256 createdAt;      // Creation timestamp
    }

    /**
     * @notice Validate LimitOrder parameters
     */
    function validateOrder(LimitOrder calldata order) internal view {
        require(order.maker != address(0), "Invalid maker");
        require(order.baseToken != address(0), "Invalid baseToken");
        require(order.quoteToken != address(0), "Invalid quoteToken");
        require(order.baseToken != order.quoteToken, "Identical tokens");
        require(order.baseToken < order.quoteToken, "Tokens not sorted");
        require(order.baseAmount > 0 && order.baseAmount <= MAX_BASE_AMOUNT, "Invalid baseAmount");
        require(order.price > 0, "Invalid price");
        require(order.expiry == 0 || order.expiry > block.timestamp, "Expired order");
        require(order.nonce != 0, "Invalid nonce");
    }
}