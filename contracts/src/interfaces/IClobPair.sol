// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../libraries/OrderStructs.sol";

/**
 * @title IClobPair
 * @notice On-chain order book for a token pair with FIFO per price-level.
 */
interface IClobPair {
    // --- Events ---

    /// Emitted when an order is accepted on the book (after potential immediate matching).
    event OrderPlaced(bytes32 indexed orderHash, OrderStructs.LimitOrder order, uint64 orderId);

    /// Emitted when an order is cancelled and removed from the book.
    event OrderCancelled(bytes32 indexed orderHash, address indexed maker, uint64 orderId);

    /// Emitted when an order expires and is removed from the book.
    event OrderExpired(bytes32 indexed orderHash, address indexed maker, uint64 orderId);

    /// Emitted on every fill (partial or final) against a resting order.
    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        uint128 fillBase,
        uint128 fillQuote,
        uint256 price,
        bool isFinal
    );

    // --- Mutations ---

    /**
     * @notice Place a limit order. May partially/fully match immediately.
     * @return orderHash EIP-712 digest of the order
     * @return filledAmount base filled at placement time
     */
    function placeLimitOrder(OrderStructs.LimitOrder calldata order)
        external
        returns (bytes32 orderHash, uint64 filledAmount);

    /**
     * @notice Cancel a resting order by its hash (only maker).
     */
    function cancelOrderByHash(bytes32 orderHash) external;

    /**
     * @notice Cancel a resting order by passing the original order struct (router path).
     */
    function cancelOrder(OrderStructs.LimitOrder calldata order) external;

    /**
     * @notice Router-only helper: cancel by hash + expected maker.
     */
    function cancelOrderByHashFromRouter(bytes32 orderHash, address maker) external;

    /**
     * @notice Clean up expired orders at a given price level.
     * @param price The price level to clean up
     * @param maxOrders Maximum number of orders to process
     * @return cleaned Number of orders cleaned
     */
    function cleanupExpiredOrders(uint256 price, uint64 maxOrders) external returns (uint64 cleaned);

    // --- Views ---

    /**
     * @notice Return status information for an order hash.
     */
    function getOrderInfo(bytes32 orderHash) external view returns (OrderStructs.OrderInfo memory orderInfo);

    /**
     * @notice Return all order hashes currently owned by a user on this pair.
     */
    function getUserOrders(address user) external view returns (bytes32[] memory orderHashes);

    /**
     * @notice Pair configuration tuple.
     */
    function getPairInfo() external view returns (address baseToken, address quoteToken, uint256 tickSize);

    /**
     * @notice Vault address used for settlements.
     */
    function getVault() external view returns (address vault);

    /**
     * @notice Best bid level summary.
     */
    function getBestBid() external view returns (bool exists, uint256 price, uint64 totalBase);

    /**
     * @notice Best ask level summary.
     */
    function getBestAsk() external view returns (bool exists, uint256 price, uint64 totalBase);

    /**
     * @notice Aggregate depth at a given price (both sides combined).
     */
    function getPriceLevel(uint256 price) external view returns (uint64 totalBase, uint64 orderCount);

    /**
     * @notice Detailed info for a resting order hash (used by Router to locate/cancel).
     */
    function getOrderDetails(bytes32 orderHash)
        external
        view
        returns (bool exists, bool isBid, uint256 price, uint64 remainingAmount, address maker);
}