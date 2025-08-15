// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
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

    modifier nonZeroAmount(uint256 amount) {
        require(amount > 0, "Vault: amount must be positive");
        _;
    }

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Deposit tokens into the vault
     * @param token The token address to deposit
     * @param amount The amount to deposit
     */
    function deposit(address token, uint256 amount) external override nonReentrant whenNotPaused onlySupportedToken(token) nonZeroAmount(amount) {
        require(token != address(0), "Vault: invalid token");

        _userBalances[msg.sender][token] += amount;
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, token, amount);
    }

    /**
     * @notice Deposit tokens with EIP-712 permit signature
     * @param token The token address to deposit
     * @param amount The amount to deposit
     * @param deadline The deadline for the permit signature
     * @param v The v component of the signature
     * @param r The r component of the signature
     * @param s The s component of the signature
     */
    function depositWithPermit(
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override nonReentrant whenNotPaused onlySupportedToken(token) nonZeroAmount(amount) {
        require(token != address(0), "Vault: invalid token");
        require(deadline >= block.timestamp, "Vault: permit expired");

        // Verify permit signature and approve vault
        try IERC20Permit(token).permit(msg.sender, address(this), amount, deadline, v, r, s) {
            // Permit successful, transfer tokens
            _userBalances[msg.sender][token] += amount;
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            emit Deposited(msg.sender, token, amount);
        } catch {
            // Permit failed (token doesn't support permit or invalid signature)
            revert("Vault: permit failed");
        }
    }

    /**
     * @notice Withdraw tokens from the vault
     * @param token The token address to withdraw
     * @param amount The amount to withdraw
     */
    function withdraw(address token, uint256 amount) external override nonReentrant whenNotPaused onlySupportedToken(token) nonZeroAmount(amount) {
        require(token != address(0), "Vault: invalid token");
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
     * @notice Batch deposit with EIP-712 permit signatures
     * @param tokens Array of token addresses
     * @param amounts Array of amounts to deposit
     * @param deadlines Array of deadlines for permit signatures
     * @param v Array of v components of signatures
     * @param r Array of r components of signatures
     * @param s Array of s components of signatures
     */
    function batchDepositWithPermit(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata deadlines,
        uint8[] calldata v,
        bytes32[] calldata r,
        bytes32[] calldata s
    ) external override nonReentrant whenNotPaused {
        require(
            tokens.length == amounts.length &&
            amounts.length == deadlines.length &&
            deadlines.length == v.length &&
            v.length == r.length &&
            r.length == s.length,
            "Vault: array length mismatch"
        );
        require(tokens.length > 0, "Vault: empty arrays");

        for (uint256 i = 0; i < tokens.length; i++) {
            _processSingleDepositWithPermit(tokens[i], amounts[i], deadlines[i], v[i], r[i], s[i]);
        }
    }

    function _processSingleDepositWithPermit(
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        require(token != address(0), "Vault: invalid token");
        require(amount > 0, "Vault: amount must be positive");
        require(supportedTokens[token], "Vault: token not supported");
        require(deadline >= block.timestamp, "Vault: permit expired");

        // Verify permit signature and approve vault
        try IERC20Permit(token).permit(msg.sender, address(this), amount, deadline, v, r, s) {
            // Permit successful, transfer tokens
            _userBalances[msg.sender][token] += amount;
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            emit Deposited(msg.sender, token, amount);
        } catch {
            // Permit failed for this token, skip it
            revert("Vault: permit failed for token");
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
    function lockBalance(address user, address token, uint256 amount) external override onlyExecutor whenNotPaused onlySupportedToken(token) nonZeroAmount(amount) {
        require(_userBalances[user][token] >= amount, "Vault: insufficient balance");

        _userBalances[user][token] -= amount;
        _lockedBalances[user][token] += amount;
        emit BalanceLocked(user, token, amount);
    }

    ///@notice Unlock user balance
    function unlockBalance(address user, address token, uint256 amount) external override onlyExecutor whenNotPaused onlySupportedToken(token) nonZeroAmount(amount) {
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
    ) external override onlyExecutor whenNotPaused {
        require(amount > 0, "Vault: amount must be positive");
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
        if (authorizedExecutors[executor]) {
            authorizedExecutors[executor] = false;
        }
    }

    // Token management

    /**
     * @notice Add supported token for trading
     * @param token The token address
     */
    function addSupportedToken(address token) external override onlyOwner {
        require(token != address(0), "Vault: invalid token address");
        require(!supportedTokens[token], "Vault: already supported");
        supportedTokens[token] = true;
    }

    /**
     * @notice Remove supported token from trading
     * @param token The token address
     */
    function removeSupportedToken(address token) external override onlyOwner {
        require(token != address(0), "Vault: invalid token address");
        require(supportedTokens[token], "Vault: not supported");
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
