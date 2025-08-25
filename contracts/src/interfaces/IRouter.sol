// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../libraries/OrderStructs.sol";

/**
 * @title IRouter
 * @notice User entry-point: performs EIP-712 validation and routes orders to ClobPair.
 */
interface IRouter {
    // --- Events ---

    event OrderPlaced(bytes32 indexed orderHash, address indexed maker, address indexed clobPair, OrderStructs.LimitOrder order);
    event OrderCancelled(bytes32 indexed orderHash, address indexed maker, address indexed clobPair);
    event BatchOrdersPlaced(address indexed maker, uint256 orderCount);
    event BatchOrdersCancelled(address indexed maker, uint256 orderCount);
    event BatchFailed(uint256 index, string reason);

    // --- Mutations ---

    /**
     * @notice Place a limit order.
     * @param order EIP-712 order
     * @param signature Maker signature if msg.sender != maker
     * @return orderHash EIP-712 digest
     */
    function placeLimitOrder(
        OrderStructs.LimitOrder calldata order,
        bytes calldata signature
    ) external returns (bytes32 orderHash);

    /**
     * @notice Cancel via original order struct (supports maker-signed cancel).
     */
    function cancelOrder(
        OrderStructs.LimitOrder calldata order,
        bytes calldata signature
    ) external;

    /**
     * @notice Batch place multiple orders.
     */
    function batchPlaceLimitOrders(
        OrderStructs.LimitOrder[] calldata orders,
        bytes[] calldata signatures
    ) external;

    /**
     * @notice Batch cancel multiple orders.
     */
    function batchCancelOrders(
        OrderStructs.LimitOrder[] calldata orders,
        bytes[] calldata signatures
    ) external;

    /**
     * @notice Cancel by order hash if still indexed as active.
     */
    function cancelOrderByHash(bytes32 orderHash) external;

    /**
     * @notice Clean up expired orders on a specific ClobPair.
     * @param clobPair The ClobPair contract to clean up
     * @param price The price level to clean up
     * @param maxOrders Maximum number of orders to process
     * @return cleaned Number of orders cleaned
     * @dev Should be non-reentrant to prevent reentrancy attacks.
     */
    function cleanupExpiredOrders(
        address clobPair, 
        uint256 price, 
        uint64 maxOrders
    ) external returns (uint64 cleaned);

    // --- Views ---

    /**
     * @notice Factory address backing this router.
     */
    function getFactory() external view returns (address factoryAddress);

    /**
     * @notice EIP-712 domain separator.
     */
    function domainSeparator() external view returns (bytes32);

    /**
     * @notice Compute EIP-712 digest for an order.
     */
    function hashOrder(OrderStructs.LimitOrder calldata order) external view returns (bytes32);

    /**
     * @notice Next expected nonce for a maker.
     */
    function getUserNonce(address user) external view returns (uint256);

    /**
     * @notice Maker currently indexed for an order hash (if active).
     */
    function getOrderMaker(bytes32 orderHash) external view returns (address);

    /**
     * @notice Whether this order hash is still indexed as active.
     */
    function orderExists(bytes32 orderHash) external view returns (bool);
}