// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../libraries/OrderStructs.sol"; 

/**
 * @title IClobPair
 * @notice Interface for a ClobPair contract that manages an on-chain order book.
 */
interface IClobPair {
    event OrderPlaced(bytes32 indexed orderHash, OrderStructs.LimitOrder order);
    event OrderCancelled(bytes32 indexed orderHash, address indexed maker);
    event Trade(
        bytes32 indexed baseToken,
        bytes32 indexed quoteToken,
        address indexed maker,
        address taker,
        uint128 baseAmount,
        uint128 quoteAmount,
        uint256 price
    );
    
    /**
     * @notice Places a limit order. Can result in an immediate trade if it's marketable.
     * @param order The limit order to place.
     * @return orderHash The hash of the placed order.
     */
    function placeLimitOrder(OrderStructs.LimitOrder calldata order) external returns (bytes32 orderHash);

    /**
     * @notice Cancels an existing limit order.
     * @dev The caller (msg.sender) must be the maker of the order.
     * @param order The original limit order to cancel.
     */
    function cancelOrder(OrderStructs.LimitOrder calldata order) external;

    function getOrderInfo(bytes32 orderHash) external view returns (OrderStructs.OrderInfo memory orderInfo);
    function getUserOrders(address user) external view returns (bytes32[] memory orderHashes);
    function getPairInfo() external view returns (address baseToken, address quoteToken, uint256 tickSize);
    function getVault() external view returns (address vault);
}