// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../libraries/OrderStructs.sol"; 

/**
 * @title IClobPair
 * @notice Interface for a ClobPair contract that manages an on-chain order book.
 */
interface IClobPair {
    // --- Events ---
    event OrderPlaced(bytes32 indexed orderHash, OrderStructs.LimitOrder order, uint64 orderId);
    event OrderCancelled(bytes32 indexed orderHash, address indexed maker, uint64 orderId);
    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        uint128 fillBase,
        uint128 fillQuote,
        uint256 price,
        bool isFinal 
    );

    /**
     * @notice Places a limit order. Can result in immediate partial/complete fills against resting opposite side.
     * @param order Limit order 
     * @return orderHash Hash of placed order
     * @return orderId Internal order ID for tracking
     */
    function placeLimitOrder(OrderStructs.LimitOrder calldata order) external returns (bytes32 orderHash, uint64 orderId);

    /**
     * @notice Cancel a resting order by hash (only maker). Will unlock remaining locked balance via Vault.
     * @param orderHash Hash of order to cancel
     */
    function cancelOrderByHash(bytes32 orderHash) external;

    /**
     * @notice Cancel a resting order by providing original order struct
     * @param order Original order struct
     */
    function cancelOrder(OrderStructs.LimitOrder calldata order) external;

    // --- Views ---
    function getOrderInfo(bytes32 orderHash) external view returns (OrderStructs.OrderInfo memory orderInfo);
    function getUserOrders(address user) external view returns (bytes32[] memory orderHashes);
    function getPairInfo() external view returns (address baseToken, address quoteToken, uint256 tickSize);
    function getVault() external view returns (address vault);

    // Best bid / ask helpers 
    function getBestBid() external view returns (bool exists, uint256 price, uint64 totalBase);
    function getBestAsk() external view returns (bool exists, uint256 price, uint64 totalBase);

    // Depth query for a specific price level (aggregate remaining base amount)
    function getPriceLevel(uint256 price) external view returns (uint64 totalBase, uint64 orderCount);
}