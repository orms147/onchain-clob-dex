// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IClobFactory
 * @notice Interface for factory contract that creates and manages ClobPair contracts
 */
interface IClobFactory {

    event ClobPairCreated(address indexed clobPair, address indexed baseToken, address indexed quoteToken, uint256 tickSize);

    /// @notice Create a new ClobPair for trading
    function createClobPair(address baseToken, address quoteToken, uint256 tickSize) external returns (address clobPair);

    /// @notice Get the address of an existing ClobPair
    function getClobPair(address baseToken, address quoteToken, uint256 tickSize) external view returns (address clobPair);

    /// @notice Get all deployed ClobPair addresses
    function getAllPairs() external view returns (address[] memory pairs);

    /// @notice Check if a ClobPair exists
    function isPairExisted(address baseToken, address quoteToken, uint256 tickSize) external view returns (bool exists);

    /// @notice Get total number of created pairs
    /// @return count Total pair count
    function getPairCount() external view returns (uint256 count);

    /// @notice Compute unique key for a trading pair
    function computePairKey(address baseToken, address quoteToken, uint256 tickSize) external pure returns (bytes32 key);
}
