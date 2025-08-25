// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IClobFactory
 * @notice Factory that creates and indexes ClobPair instances.
 */
interface IClobFactory {
    // --- Events ---

    /// Emitted when a new pair is created.
    event PairCreated(address indexed baseToken, address indexed quoteToken, uint256 tickSize, address clobPair);

    // --- Mutations ---

    /**
     * @notice Deploy a new ClobPair for (baseToken, quoteToken) at a given tickSize.
     * @dev Pair uses canonical ordering: (a, b) where a < b.
     */
    function createClobPair(address baseToken, address quoteToken, uint256 tickSize) external returns (address clobPair);

    // --- Views ---

    /**
     * @notice Return an existing ClobPair for the given tuple, or address(0) if absent.
     * @dev Inputs may be in any order; implementation canonicalizes internally.
     */
    function getClobPair(address baseToken, address quoteToken, uint256 tickSize) external view returns (address clobPair);

    /**
     * @notice Return all pairs deployed by this factory.
     */
    function getAllPairs() external view returns (address[] memory pairs);

    /**
     * @notice Return total number of pairs.
     */
    function getPairCount() external view returns (uint256 count);

    /**
     * @notice Compute a unique key for (base, quote, tickSize) using canonical order.
     */
    function computePairKey(address baseToken, address quoteToken, uint256 tickSize) external pure returns (bytes32 key);

    /**
     * @notice Address of the Vault used by all pairs created by this factory.
     */
    function getVault() external view returns (address vault);
}