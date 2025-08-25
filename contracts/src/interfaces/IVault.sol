// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IVault
 * @notice Central ledger for user balances and trading settlements.
 */
interface IVault {
    // --- Events ---

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event BalanceLocked(address indexed user, address indexed token, uint256 amount);
    event BalanceUnlocked(address indexed user, address indexed token, uint256 amount);
    event TransferExecuted(address indexed from, address indexed to, address indexed token, uint256 amount);
    event ExecutorAuthorized(address indexed executor, bool authorized, uint256 executionTime);
    event TokenSupportChanged(address indexed token, bool supported, uint256 executionTime);
    event EmergencyWithdrawProposed(address indexed token, address indexed to, uint256 amount, uint256 executionTime);

    // --- User I/O ---

    function deposit(address token, uint256 amount) external;
    function withdraw(address token, uint256 amount) external;

    function batchDeposit(address[] calldata tokens, uint256[] calldata amounts) external;
    function batchWithdraw(address[] calldata tokens, uint256[] calldata amounts) external;

    function depositWithPermit(
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function batchDepositWithPermit(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata deadlines,
        uint8[] calldata v,
        bytes32[] calldata r,
        bytes32[] calldata s
    ) external;

    // --- Trading hooks (executor-only) ---

    function lockBalance(address user, address token, uint256 amount) external;
    function unlockBalance(address user, address token, uint256 amount) external;

    /**
     * @notice Transfer tokens internally from locked balance of `from` to available balance of `to`.
     * @dev Must be called only by authorized executors (e.g., ClobPairs) during settlement.
     */
    function executeTransfer(address from, address to, address token, uint256 amount) external;

    // --- Admin (timelock-protected) ---

    /**
     * @notice Propose authorizing or revoking an executor.
     */
    function proposeAuthorizeExecutor(address executor, bool isAuthorized) external;

    /**
     * @notice Execute a pending executor authorization.
     */
    function executeAuthorizeExecutor(address executor, bool isAuthorized) external;

    /**
     * @notice Propose adding a supported token.
     */
    function proposeAddSupportedToken(address token) external;

    /**
     * @notice Execute adding a supported token.
     */
    function executeAddSupportedToken(address token) external;

    /**
     * @notice Propose removing a supported token.
     */
    function proposeRemoveSupportedToken(address token) external;

    /**
     * @notice Execute removing a supported token.
     */
    function executeRemoveSupportedToken(address token) external;

    /**
     * @notice Propose an emergency withdrawal.
     */
    function proposeEmergencyWithdraw(address token, address to, uint256 amount) external;

    /**
     * @notice Execute an emergency withdrawal (requires pause).
     */
    function executeEmergencyWithdraw(address token, address to, uint256 amount) external;

    function pause() external;
    function unpause() external;

    // --- Views ---

    function getTotalBalance(address user, address token) external view returns (uint256 totalBalance);
    function getAvailableBalance(address user, address token) external view returns (uint256 availableBalance);
    function getLockedBalance(address user, address token) external view returns (uint256 lockedBalance);

    function isSupportedToken(address token) external view returns (bool);
    function isExecutor(address executor) external view returns (bool);
}