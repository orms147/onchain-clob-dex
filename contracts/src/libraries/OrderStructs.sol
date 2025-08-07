// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title OrderStructs
 * @notice Contains all order-related data structures for the CLOB DEX
 */
library OrderStructs {
    
    /**
     * @notice Structure representing a limit order
     * @dev This struct is used for EIP-712 signing
     */
    struct LimitOrder {
        address maker;           // Address placing the order
        address baseToken;       // Base token address (smaller address)
        address quoteToken;      // Quote token address (larger address)
        uint256 baseAmount;      // Amount of base token to sell
        uint256 quoteAmount;     // Amount of quote token to receive
        uint256 price;           // Price (quote per base)
        uint256 tickSize;        // Minimum price increment
        bool isSellBase;         // true = sell base, false = sell quote
        uint256 expiry;          // Order expiration timestamp
        uint256 salt;            // Random number for uniqueness
        uint256 nonce;           // User's nonce for order uniqueness
    }

    /**
     * @notice Structure for market orders
     */
    struct MarketOrder {
        address maker;
        address baseToken;       // Base token address (smaller address)
        address quoteToken;      // Quote token address (larger address)
        uint256 amount;          // Amount of token to sell
        bool isSellBase;         // true = sell base, false = sell quote
        uint256 maxSlippage;     // Maximum acceptable slippage (basis points)
        uint256 expiry;
        uint256 salt;
        uint256 nonce;
    }

    /**
     * @notice Structure representing order status and fill information
     */
    struct OrderInfo {
        bytes32 orderHash;       // Hash of the order
        uint256 filledAmount;    // Amount already filled
        uint256 remainingAmount; // Amount remaining to be filled
        bool isCancelled;        // Whether order was cancelled
        bool isExpired;          // Whether order has expired
        uint256 createdAt;       // Block timestamp when order was created
    }

    /**
     * @notice Structure for trade execution details
     */
    struct TradeExecution {
        bytes32 makerOrderHash;
        bytes32 takerOrderHash;
        address maker;
        address taker;
        address baseToken;
        address quoteToken;
        uint256 baseAmount;
        uint256 quoteAmount;
        uint256 price;
        uint256 timestamp;
        uint256 blockNumber;
    }

    /**
     * @notice Enum for order types
     */
    enum OrderType {
        LIMIT,
        MARKET,
        STOP_LIMIT,
        STOP_MARKET
    }

    /**
     * @notice Enum for order status
     */
    enum OrderStatus {
        PENDING,
        PARTIALLY_FILLED,
        FILLED,
        CANCELLED,
        EXPIRED
    }
}
