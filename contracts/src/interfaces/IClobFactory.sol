// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IClobFactory
 * @notice Interface for factory contract that creates and manages ClobPair contracts
 */
interface IClobFactory {

    event PairCreated(address indexed baseToken, address indexed quoteToken, uint256 tickSize, address clobPair);

    /// @notice Create a new ClobPair for trading (tokens will be canonicalized: lower address becomes base)
    function createClobPair(address baseToken, address quoteToken, uint256 tickSize) external returns (address clobPair);

    /// @notice Get the address of an existing ClobPair
    function getClobPair(address baseToken, address quoteToken, uint256 tickSize) external view returns (address clobPair);

    /// @notice Get all deployed ClobPair addresses
    function getAllPairs() external view returns (address[] memory pairs);

    /// @notice Get total number of created pairs
    /// @return count Total pair count
    function getPairCount() external view returns (uint256 count);

    /// @notice Compute unique key for a trading pair
    function computePairKey(address baseToken, address quoteToken, uint256 tickSize) external pure returns (bytes32 key);

    /// @notice Vault used by all pairs
    function getVault() external view returns (address vault);
}
