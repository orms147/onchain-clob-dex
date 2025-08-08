// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IVault
 * @notice Interface for the Vault contract, which manages and settles assets.
 */
interface IVault {
    
    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event BalanceLocked(address indexed user, address indexed token, uint256 amount);
    event BalanceUnlocked(address indexed user, address indexed token, uint256 amount);
    event TransferExecuted(address indexed from, address indexed to, address indexed token, uint256 amount);

    /// @notice Deposit tokens into vault
    function deposit(address token, uint256 amount) external;
    /// @notice Withdraw tokens from vault
    function withdraw(address token, uint256 amount) external;

    /// @notice batching
    function batchDeposit(address[] calldata tokens, uint256[] calldata amounts) external;
    function batchWithdraw(address[] calldata tokens, uint256[] calldata amounts) external;

    /// @notice Lock user's balance for trading (called by authorized ClobPairs)
    function lockBalance(address user, address token, uint256 amount) external;
    /// @notice Unlock user's balance (when order is cancelled or partially filled)
    function unlockBalance(address user, address token, uint256 amount) external;

    /// @notice Execute transfer between users during trade settlement
    function executeTransfer(address from, address to, address token, uint256 amount) external;

    /// @notice Get user's total balance for a token
    function getTotalBalance(address user, address token) external view returns (uint256 totalBalance);
    /// @notice Get user's available balance for trading
    function getAvailableBalance(address user, address token) external view returns (uint256 availableBalance);
    /// @notice Get user's locked balance in active orders
    function getLockedBalance(address user, address token) external view returns (uint256 lockedBalance);

    /// @notice Check if a token is supported
    function isSupportedToken(address token) external view returns (bool);
    /// @notice Check if an address is an authorized executor
    function isExecutor(address executor) external view returns (bool);


    /// @notice Authorize/revoke executor permissions
    function authorizeExecutor(address executor, bool isAuthorized) external;
    /// @notice Revoke executor permissions
    function revokeExecutor(address executor) external;

    /// @notice Pause vault operations
    function pause() external;
    /// @notice Unpause vault operations
    function unpause() external;    //Openzeppelin
    
    /// @notice Add supported token for trading
    function addSupportedToken(address token) external;
    /// @notice Remove supported token from trading
    function removeSupportedToken(address token) external;
}