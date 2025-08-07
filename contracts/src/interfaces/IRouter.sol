// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../libraries/OrderStructs.sol";

/**
 * @title IRouter
 * @notice Interface for Router contract - main entry point for users
 * @dev Responsible for signature validation and routing orders to appropriate ClobPair
 */
interface IRouter {

    /**
     * @notice Place a limit order
     * @param order Limit order data
     * @param signature EIP-712 signature from maker for this order
     * @return orderHash Hash of the placed order
     */
    function placeLimitOrder(
        OrderStructs.LimitOrder calldata order,
        bytes calldata signature
    ) external returns (bytes32 orderHash);

    /**
     * @notice Cancel a pending limit order
     * @param order Original limit order data to cancel
     * @param signature Maker's signature for this cancellation action
     */
    function cancelOrder(
        OrderStructs.LimitOrder calldata order,
        bytes calldata signature
    ) external;

    /**
     * @notice Place multiple limit orders in a single transaction
     * @param orders Array of limit orders
     * @param signatures Array of corresponding signatures
     */
    function batchPlaceLimitOrders(
        OrderStructs.LimitOrder[] calldata orders,
        bytes[] calldata signatures
    ) external;

    /**
     * @notice Cancel multiple limit orders in a single transaction
     * @param orders Array of orders to cancel
     * @param signatures Array of corresponding signatures
     */
    function batchCancelOrders(
        OrderStructs.LimitOrder[] calldata orders,
        bytes[] calldata signatures
    ) external;

    /**
     * @notice Get the ClobFactory address that Router is using
     * @return factoryAddress Address of the ClobFactory contract
     */
    function getFactory() external view returns (address factoryAddress);
}
