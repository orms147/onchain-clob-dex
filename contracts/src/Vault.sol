// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IVault.sol";

contract Vault is IVault, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    mapping(address => mapping(address => uint256)) private _userBalances;
    mapping(address => mapping(address => uint256)) private _lockedBalances;
    mapping(address => bool) public authorizedExecutors;
    mapping(address => bool) public supportedTokens;

    uint256 public constant TIMELOCK_DURATION = 2 days;
    mapping(bytes32 => uint256) public pendingActions; // actionHash -> executionTime

    event ExecutorAuthorized(address indexed executor, bool authorized, uint256 executionTime);
    event TokenSupportChanged(address indexed token, bool supported, uint256 executionTime);
    event EmergencyWithdrawProposed(address indexed token, address indexed to, uint256 amount, uint256 executionTime);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyExecutor() {
        require(authorizedExecutors[msg.sender], "Vault: not authorized executor");
        _;
    }

    modifier nonZero(uint256 amount) {
        require(amount > 0, "Vault: zero amount");
        _;
    }

    function safeDeposit(address token, uint256 amount) internal {
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        require(balanceAfter - balanceBefore == amount, "Vault: deposit amount mismatch");
    }

    function deposit(address token, uint256 amount)
        external
        override
        nonReentrant
        whenNotPaused
        nonZero(amount)
    {
        require(supportedTokens[token], "Vault: token not supported");
        safeDeposit(token, amount);
        _userBalances[msg.sender][token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount)
        external
        override
        nonReentrant
        whenNotPaused
        nonZero(amount)
    {
        require(_userBalances[msg.sender][token] >= amount, "Vault: insufficient balance");
        _userBalances[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    function batchDeposit(address[] calldata tokens, uint256[] calldata amounts)
        external
        override
        nonReentrant
        whenNotPaused
    {
        require(tokens.length == amounts.length, "Vault: length mismatch");
        require(tokens.length > 0, "Vault: empty arrays");

        for (uint256 i = 0; i < tokens.length; i++) {
            address t = tokens[i];
            uint256 amt = amounts[i];
            require(t != address(0), "Vault: invalid token");
            require(supportedTokens[t], "Vault: token not supported");
            require(amt > 0, "Vault: zero amount");

            safeDeposit(t, amt);
            _userBalances[msg.sender][t] += amt;
            emit Deposited(msg.sender, t, amt);
        }
    }

    function batchWithdraw(address[] calldata tokens, uint256[] calldata amounts)
        external
        override
        nonReentrant
        whenNotPaused
    {
        require(tokens.length == amounts.length, "Vault: length mismatch");
        require(tokens.length > 0, "Vault: empty arrays");

        for (uint256 i = 0; i < tokens.length; i++) {
            address t = tokens[i];
            uint256 amt = amounts[i];
            require(t != address(0), "Vault: invalid token");
            require(amt > 0, "Vault: zero amount");
            require(_userBalances[msg.sender][t] >= amt, "Vault: insufficient balance");

            _userBalances[msg.sender][t] -= amt;
            IERC20(t).safeTransfer(msg.sender, amt);
            emit Withdrawn(msg.sender, t, amt);
        }
    }

    function depositWithPermit(
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        external
        override
        nonReentrant
        whenNotPaused
        nonZero(amount)
    {
        require(supportedTokens[token], "Vault: token not supported");
        require(deadline >= block.timestamp, "Vault: permit expired");

        try IERC20Permit(token).permit(msg.sender, address(this), amount, deadline, v, r, s) {
            safeDeposit(token, amount);
            _userBalances[msg.sender][token] += amount;
            emit Deposited(msg.sender, token, amount);
        } catch {
            revert("Vault: permit failed");
        }
    }

    function batchDepositWithPermit(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata deadlines,
        uint8[] calldata v,
        bytes32[] calldata r,
        bytes32[] calldata s
    )
        external
        override
        nonReentrant
        whenNotPaused
    {
        require(
            tokens.length == amounts.length &&
            amounts.length == deadlines.length &&
            deadlines.length == v.length &&
            v.length == r.length &&
            r.length == s.length,
            "Vault: length mismatch"
        );
        require(tokens.length > 0, "Vault: empty arrays");

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 amount = amounts[i];
            uint256 deadline = deadlines[i];

            require(token != address(0), "Vault: invalid token");
            require(supportedTokens[token], "Vault: token not supported");
            require(amount > 0, "Vault: zero amount");
            require(deadline >= block.timestamp, "Vault: permit expired");

            try IERC20Permit(token).permit(msg.sender, address(this), amount, deadline, v[i], r[i], s[i]) {
                safeDeposit(token, amount);
                _userBalances[msg.sender][token] += amount;
                emit Deposited(msg.sender, token, amount);
            } catch {
                revert("Vault: permit failed");
            }
        }
    }

    function lockBalance(address user, address token, uint256 amount)
        external
        override
        onlyExecutor
        whenNotPaused
        nonZero(amount)
    {
        require(_userBalances[user][token] >= amount, "Vault: insufficient balance");
        _userBalances[user][token] -= amount;
        _lockedBalances[user][token] += amount;
        emit BalanceLocked(user, token, amount);
    }

    function unlockBalance(address user, address token, uint256 amount)
        external
        override
        onlyExecutor
        whenNotPaused
        nonZero(amount)
    {
        require(_lockedBalances[user][token] >= amount, "Vault: insufficient locked balance");
        _lockedBalances[user][token] -= amount;
        _userBalances[user][token] += amount;
        emit BalanceUnlocked(user, token, amount);
    }

    function executeTransfer(address from, address to, address token, uint256 amount)
        external
        override
        onlyExecutor
        whenNotPaused
        nonReentrant
    {
        require(from != address(0) && to != address(0), "Vault: invalid address");
        require(supportedTokens[token], "Vault: token not supported");
        require(amount > 0, "Vault: zero amount");
        require(_lockedBalances[from][token] >= amount, "Vault: insufficient locked balance");

        _lockedBalances[from][token] -= amount;
        _userBalances[to][token] += amount;

        emit TransferExecuted(from, to, token, amount);
    }

    function proposeAuthorizeExecutor(address executor, bool isAuthorized) external onlyOwner {
        require(executor != address(0), "Vault: invalid executor");
        bytes32 actionHash = keccak256(abi.encode("authorizeExecutor", executor, isAuthorized));
        pendingActions[actionHash] = block.timestamp + TIMELOCK_DURATION;
        emit ExecutorAuthorized(executor, isAuthorized, pendingActions[actionHash]);
    }

    function executeAuthorizeExecutor(address executor, bool isAuthorized) external onlyOwner {
        bytes32 actionHash = keccak256(abi.encode("authorizeExecutor", executor, isAuthorized));
        require(pendingActions[actionHash] != 0, "Vault: no pending action");
        require(block.timestamp >= pendingActions[actionHash], "Vault: timelock not expired");
        authorizedExecutors[executor] = isAuthorized;
        delete pendingActions[actionHash];
        emit ExecutorAuthorized(executor, isAuthorized, block.timestamp);
    }

    function proposeAddSupportedToken(address token) external onlyOwner {
        require(token != address(0), "Vault: invalid token");
        require(!supportedTokens[token], "Vault: already supported");
        bytes32 actionHash = keccak256(abi.encode("addSupportedToken", token));
        pendingActions[actionHash] = block.timestamp + TIMELOCK_DURATION;
        emit TokenSupportChanged(token, true, pendingActions[actionHash]);
    }

    function executeAddSupportedToken(address token) external onlyOwner {
        bytes32 actionHash = keccak256(abi.encode("addSupportedToken", token));
        require(pendingActions[actionHash] != 0, "Vault: no pending action");
        require(block.timestamp >= pendingActions[actionHash], "Vault: timelock not expired");
        supportedTokens[token] = true;
        delete pendingActions[actionHash];
        emit TokenSupportChanged(token, true, block.timestamp);
    }

    function proposeRemoveSupportedToken(address token) external onlyOwner {
        require(token != address(0), "Vault: invalid token");
        require(supportedTokens[token], "Vault: not supported");
        bytes32 actionHash = keccak256(abi.encode("removeSupportedToken", token));
        pendingActions[actionHash] = block.timestamp + TIMELOCK_DURATION;
        emit TokenSupportChanged(token, false, pendingActions[actionHash]);
    }

    function executeRemoveSupportedToken(address token) external onlyOwner {
        bytes32 actionHash = keccak256(abi.encode("removeSupportedToken", token));
        require(pendingActions[actionHash] != 0, "Vault: no pending action");
        require(block.timestamp >= pendingActions[actionHash], "Vault: timelock not expired");
        supportedTokens[token] = false;
        delete pendingActions[actionHash];
        emit TokenSupportChanged(token, false, block.timestamp);
    }

    function proposeEmergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "Vault: invalid token");
        require(to != address(0), "Vault: invalid recipient");
        require(amount > 0, "Vault: zero amount");
        bytes32 actionHash = keccak256(abi.encode("emergencyWithdraw", token, to, amount));
        pendingActions[actionHash] = block.timestamp + TIMELOCK_DURATION;
        emit EmergencyWithdrawProposed(token, to, amount, pendingActions[actionHash]);
    }

    function executeEmergencyWithdraw(address token, address to, uint256 amount)
        external
        onlyOwner
        whenPaused
    {
        bytes32 actionHash = keccak256(abi.encode("emergencyWithdraw", token, to, amount));
        require(pendingActions[actionHash] != 0, "Vault: no pending action");
        require(block.timestamp >= pendingActions[actionHash], "Vault: timelock not expired");
        IERC20(token).safeTransfer(to, amount);
        delete pendingActions[actionHash];
    }

    function pause() external override onlyOwner {
        _pause();
    }

    function unpause() external override onlyOwner {
        _unpause();
    }

    function getTotalBalance(address user, address token)
        external
        view
        override
        returns (uint256)
    {
        return _userBalances[user][token] + _lockedBalances[user][token];
    }

    function getAvailableBalance(address user, address token)
        external
        view
        override
        returns (uint256)
    {
        return _userBalances[user][token];
    }

    function getLockedBalance(address user, address token)
        external
        view
        override
        returns (uint256)
    {
        return _lockedBalances[user][token];
    }

    function isSupportedToken(address token) external view override returns (bool) {
        return supportedTokens[token];
    }

    function isExecutor(address executor) external view override returns (bool) {
        return authorizedExecutors[executor];
    }
}