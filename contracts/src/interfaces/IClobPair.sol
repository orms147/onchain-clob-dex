// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../libraries/OrderStructs.sol"; 

/**
 * @title IClobPair
 * @notice Interface for a ClobPair contract that manages an on-chain order book.
 */
interface IClobPair {
    // --- Events ---
    event OrderPlaced(bytes32 indexed orderHash, OrderStructs.LimitOrder order);
    event OrderCancelled(bytes32 indexed orderHash, address indexed maker);
    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        uint256 fillBase,
        uint256 fillQuote,
        uint256 price,
        bool isFinal 
    );

    /**
     * @notice Places a limit order. Can result in immediate partial/complete fills against resting opposite side.
     * @param order Limit order (EIP-712 validated at router layer or directly if pair validates)
     * @return orderHash Hash of placed order
     */
    function placeLimitOrder(OrderStructs.LimitOrder calldata order) external returns (bytes32 orderHash);

    /**
     * @notice Cancel a resting order (only maker). Will unlock remaining locked balance via Vault.
     * @param order Original order struct
     */
    function cancelOrder(OrderStructs.LimitOrder calldata order) external;

    // --- Views ---
    function getOrderInfo(bytes32 orderHash) external view returns (OrderStructs.OrderInfo memory orderInfo);
    function getUserOrders(address user) external view returns (bytes32[] memory orderHashes);
    function getPairInfo() external view returns (address baseToken, address quoteToken, uint256 tickSize);
    function getVault() external view returns (address vault);

    // Best bid / ask helpers (0 success flag via bool)
    function getBestBid() external view returns (bool exists, uint256 price, uint256 totalBase);
    function getBestAsk() external view returns (bool exists, uint256 price, uint256 totalBase);

    // Depth query for a specific price level (aggregate remaining base amount)
    function getPriceLevel(uint256 price) external view returns (uint256 totalBase, uint256 orderCount);
}

