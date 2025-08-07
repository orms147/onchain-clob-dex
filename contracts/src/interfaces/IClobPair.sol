// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../libraries/OrderStructs.sol";

/**
 * @title IClobPair
 * @notice Interface for ClobPair contract that manages orderbook and trade execution
 */
interface IClobPair {

    event OrderPlaced(
        bytes32 indexed orderHash, 
        address indexed maker, 
        address indexed tokenSold,
        uint256 sellAmount,
        uint256 buyAmount,
        uint256 price
    );
    
    event OrderCancelled(bytes32 indexed orderHash, address indexed maker);
    
    event OrderFilled(
        bytes32 indexed makerOrderHash,
        bytes32 indexed takerOrderHash,
        address indexed maker,
        address taker,
        uint256 baseAmount,
        uint256 quoteAmount,
        uint256 price
    );
    
    event TradeExecuted(
        address indexed maker,
        address indexed taker,
        uint256 baseAmount,
        uint256 quoteAmount,
        uint256 price,
        uint256 timestamp
    );


    /// @notice Place a limit order in the orderbook
    /// @param order The limit order to place
    /// @param signature EIP-712 signature of the order
    /// @return orderHash Hash of the placed order
    function placeLimitOrder(OrderStructs.LimitOrder calldata order, bytes calldata signature) external returns (bytes32 orderHash);

    /// @notice Place a market order for immediate execution
    /// @param order The market order to execute
    /// @param signature EIP-712 signature of the order
    /// @return filledAmount Amount that was filled
    function placeMarketOrder(OrderStructs.MarketOrder calldata order, bytes calldata signature) external returns (uint256 filledAmount);

    /// @notice Cancel an existing order
    /// @param orderHash Hash of the order to cancel
    function cancelOrder(bytes32 orderHash) external;

    /// @notice Batch cancel multiple orders
    /// @param orderHashes Array of order hashes to cancel
    function batchCancelOrders(bytes32[] calldata orderHashes) external;

    /// @notice Settle a matched trade between two users
    /// @param makerOrderHash Hash of maker order
    /// @param takerOrderHash Hash of taker order  
    /// @param fillAmount Amount being filled
    function settleTrade(
        bytes32 makerOrderHash, 
        bytes32 takerOrderHash, 
        uint256 fillAmount
    ) external;

    
    //MATCHING

    /// @notice Execute matching engine for a specific order
    /// @param orderHash Hash of the order to match
    /// @return matched order matching ?
    /// @return filledAmount Total amount filled
    function matchOrder(bytes32 orderHash) external returns (bool matched, uint256 filledAmount);

    /// @notice Run the general matching engine to process pending orders
    /// @param maxOrders Maximum number of orders to process in this call
    /// @return ordersProcessed Number of orders that were processed
    /// @return totalVolume Total volume matched in this call
    function runMatchingEngine(uint256 maxOrders) external returns (uint256 ordersProcessed, uint256 totalVolume);

    /// @notice Get best price for specified direction
    /// @param isSellBase selling base (true) or quote (false)
    /// @return bestPrice Best available price 
    function getBestPrice(bool isSellBase) external view returns (uint256 bestPrice);


    ///ORDER INFO

    /// @notice Get order information
    /// @param orderHash Hash of the order
    /// @return orderInfo Order status and fill information
    function getOrderInfo(bytes32 orderHash) 
        external 
        view 
        returns (OrderStructs.OrderInfo memory orderInfo);

    /// @notice Get user's active orders
    /// @param user Address of the user
    /// @return orderHashes Array of active order hashes
    function getUserOrders(address user) 
        external 
        view 
        returns (bytes32[] memory orderHashes);

    /// @notice Get trading pair information
    /// @return baseToken Address of base token
    /// @return quoteToken Address of quote token
    /// @return tickSize Minimum price increment
    function getPairInfo() 
        external 
        view 
        returns (address baseToken, address quoteToken, uint256 tickSize);

    /// @notice Get the Vault contract address
    /// @return vault Address of the Vault contract
    function getVault() external view returns (address vault);

    /// @notice Get total volume traded (in quote token)
    /// @return volume Total volume
    function getTotalVolume() external view returns (uint256 volume);
}
