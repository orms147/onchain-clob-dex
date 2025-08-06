// SPDX-License-Identifier: UNLICENSED
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
        address baseToken;       // Base token address (e.g., ETH)
        address quoteToken;      // Quote token address (e.g., USDC)
        uint256 baseAmount;      // Amount of base token
        uint256 quoteAmount;     // Amount of quote token
        uint256 price;           // Price per base token unit
        uint256 tickSize;        // Minimum price increment
        bool isBuy;              // true = buy order, false = sell order
        uint256 expiry;          // Order expiration timestamp
        uint256 salt;            // Random number for uniqueness
        uint256 nonce;           // User's nonce for order uniqueness
    }

    /**
     * @notice Structure for market orders
     */
    struct MarketOrder {
        address maker;
        address baseToken;
        address quoteToken;
        uint256 amount;          // Amount to buy/sell
        bool isBuy;
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
     * @notice Structure for order book levels (price levels)
     */
    struct OrderBookLevel {
        uint256 price;           // Price of this level
        uint256 totalAmount;     // Total amount at this price level
        uint256 orderCount;      // Number of orders at this level
        bytes32[] orderHashes;   // Array of order hashes at this level
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
