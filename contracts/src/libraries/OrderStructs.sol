// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title OrderStructs
 * @notice Contains all order-related data structures for the CLOB DEX
 */
library OrderStructs {
    
    /**
     * @notice Enum for order status
     */
    enum OrderStatus {
        PENDING,
        PARTIALLY_FILLED,
        CANCELLED,
        EXPIRED
    }
    
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
     * @notice Structure representing order status and fill information
     */
    struct OrderInfo {
        bytes32 orderHash;      // Hash of the order
        OrderStatus status;     // OrderStatus
        uint256 filledAmount; // Amount of base token filled 
        uint256 createdAt;       // Block timestamp when order was created
    }
}
