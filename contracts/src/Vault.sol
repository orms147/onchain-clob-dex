// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IVault.sol";

/**
 * @title Vault
 * @notice Central asset management contract for the CLOB DEX
 * @dev Manages user deposits, withdrawals, and locked balances for trading
 */
contract Vault is IVault, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // State variables
    // userAddress => tokenAddress => amount
    mapping(address => mapping(address => uint256)) private _userBalances;
    mapping(address => mapping(address => uint256)) private _lockedBalances;
    // executorAddress => isAuthorized
    mapping(address => bool) public authorizedExecutors;
    mapping(address => bool) public supportedTokens;

    // Modifiers
    modifier onlyExecutor() {
        require(authorizedExecutors[msg.sender], "Vault: not authorized executor");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedExecutors[msg.sender] || msg.sender == owner(), "Vault: not authorized");
        _;
    }

    modifier onlySupportedToken(address token) {
        require(supportedTokens[token], "Vault: token not supported :((");
        _;
    }

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Deposit tokens into the vault
     * @param token The token address to deposit
     * @param amount The amount to deposit
     */
    function deposit(address token, uint256 amount) external override nonReentrant whenNotPaused onlySupportedToken(token) {
        require(token != address(0), "Vault: invalid token");
        require(amount > 0, "Vault: amount must be positive");

        _userBalances[msg.sender][token] += amount;
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, token, amount);
    }

    /**
     * @notice Withdraw tokens from the vault
     * @param token The token address to withdraw
     * @param amount The amount to withdraw
     */
    function withdraw(address token, uint256 amount) external override nonReentrant whenNotPaused {
        require(token != address(0), "Vault: invalid token");
        require(amount > 0, "Vault: amount must be positive");
        require(_userBalances[msg.sender][token] >= amount, "Vault: insufficient balance");

        _userBalances[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, token, amount);
    }

    ///@notice Batch deposit multiple tokens

    function batchDeposit(address[] calldata tokens, uint256[] calldata amounts) external override nonReentrant whenNotPaused {
        require(tokens.length == amounts.length, "Vault: array length mismatch");
        require(tokens.length > 0, "Vault: empty token");

        for (uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] != address(0), "Vault: invalid token");
            require(amounts[i] > 0, "Vault: amount must be positive");
            require(supportedTokens[tokens[i]], "Vault: token not supported");

            IERC20(tokens[i]).safeTransferFrom(msg.sender, address(this), amounts[i]);
            _userBalances[msg.sender][tokens[i]] += amounts[i];

            emit Deposited(msg.sender, tokens[i], amounts[i]);
        }
    }

    /**
     * @notice Batch withdraw multiple tokens
     * @param tokens Array of token addresses
     * @param amounts Array of amounts to withdraw
     */
    function batchWithdraw(address[] calldata tokens, uint256[] calldata amounts) external override nonReentrant whenNotPaused {
        require(tokens.length == amounts.length, "Vault: array length mismatch");
        require(tokens.length > 0, "Vault: empty arrays");

        for (uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] != address(0), "Vault: invalid token");
            require(amounts[i] > 0, "Vault: amount must be positive");
            require(_userBalances[msg.sender][tokens[i]] >= amounts[i], "Vault: insufficient balance");

            _userBalances[msg.sender][tokens[i]] -= amounts[i];
            IERC20(tokens[i]).safeTransfer(msg.sender, amounts[i]);

            emit Withdrawn(msg.sender, tokens[i], amounts[i]);
        }
    }

    ///@notice Lock user balance for trading
    function lockBalance(address user, address token, uint256 amount) external override onlyExecutor whenNotPaused{
        require(_userBalances[user][token] >= amount, "Vault: insufficient balance");

        _userBalances[user][token] -= amount;
        _lockedBalances[user][token] += amount;
        emit BalanceLocked(user, token, amount);
    }

    ///@notice Unlock user balance
    function unlockBalance(address user, address token, uint256 amount) external override onlyExecutor whenNotPaused{
        require(_lockedBalances[user][token] >= amount, "Vault: insufficient locked balance");

        _lockedBalances[user][token] -= amount;
        _userBalances[user][token] += amount;
        emit BalanceUnlocked(user, token, amount);
    }

    ///@notice Execute transfer between users (for trade settlement)
    function executeTransfer(
        address from,
        address to,
        address token,
        uint256 amount
    ) external override onlyExecutor whenNotPaused{
        require(_lockedBalances[from][token] >= amount, "Vault: insufficient locked balance");

        _lockedBalances[from][token] -= amount;
        _userBalances[to][token] += amount;
    emit TransferExecuted(from, to, token, amount);
    }

    function getTotalBalance(address user, address token) external view override returns (uint256 totalBalance) {
        return _userBalances[user][token] + _lockedBalances[user][token];
    }

    function getAvailableBalance(address user, address token) external view override returns (uint256 availableBalance) {
        return _userBalances[user][token];
    }

    function getLockedBalance(address user, address token) external view override returns (uint256 lockedBalance) {
        return _lockedBalances[user][token];
    }

    function isSupportedToken(address token) external view override returns (bool) {
        return supportedTokens[token];
    }

    function isExecutor(address executor) external view override returns (bool) {
        return authorizedExecutors[executor];
    }

    // Authorization functions

    /**
     * @notice Authorize/revoke executor permissions
     * @param executor The executor address
     * @param isAuthorized Whether to authorize or revoke
     */
    function authorizeExecutor(address executor, bool isAuthorized) external override onlyOwner {
        require(executor != address(0), "Vault: invalid executor address");
        authorizedExecutors[executor] = isAuthorized;
    }

    /**
     * @notice Revoke executor permissions
     * @param executor The executor address
     */
    function revokeExecutor(address executor) external override onlyOwner {
        require(executor != address(0), "Vault: invalid executor address");
        authorizedExecutors[executor] = false;
    }

    // Token management

    /**
     * @notice Add supported token for trading
     * @param token The token address
     */
    function addSupportedToken(address token) external override onlyOwner {
        require(token != address(0), "Vault: invalid token address");
        supportedTokens[token] = true;
    }

    /**
     * @notice Remove supported token from trading
     * @param token The token address
     */
    function removeSupportedToken(address token) external override onlyOwner {
        require(token != address(0), "Vault: invalid token address");
        supportedTokens[token] = false;
    }

    /**
     * @notice Pause vault operations
     */
    function pause() external override onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause vault operations
     */
    function unpause() external override onlyOwner {
        _unpause();
    }

    // Emergency functions

    /**
     * @notice Emergency withdraw function (only owner, when paused)
     * @param token The token address
     * @param to The recipient address
     * @param amount The amount to withdraw
     */
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner whenPaused {
        require(token != address(0), "Vault: invalid token");
        require(to != address(0), "Vault: invalid recipient");
        require(amount > 0, "Vault: amount must be positive");

        IERC20(token).safeTransfer(to, amount);
    }
}
