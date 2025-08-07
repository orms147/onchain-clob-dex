// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { IVault } from "../interfaces/IVault.sol";

/**
 * @title Vault
 * @notice Hợp đồng này giữ tài sản của người dùng và thực hiện việc thanh toán
 * cho các giao dịch khớp lệnh một cách hiệu quả về gas.
 * @dev Kế thừa Ownable để quản trị và Pausable để bảo mật.
 */
contract Vault is IVault, Ownable, Pausable {
    // =================================================================================================
    // State Variables
    // =================================================================================================

    // Mapping 2 lớp để lưu tổng số dư của người dùng cho từng loại token
        
    mapping(address => mapping(address => uint256)) public userBalances;

    // Mapping 2 lớp để lưu số dư bị khóa trong các lệnh đang chờ
    mapping(address => mapping(address => uint256)) public lockedBalances;

    // Mapping để cấp quyền cho các hợp đồng (executors) được phép gọi các hàm quan trọng
    mapping(address => bool) public authorizedExecutors;

    // =================================================================================================
    // Modifiers
    // =================================================================================================

    /**
     * @dev Đảm bảo chỉ các executor được ủy quyền (vd: ClobPair, Router) mới có thể gọi hàm.
     */
    modifier onlyExecutor() {
        require(authorizedExecutors[msg.sender], "Vault: Caller is not an authorized executor");
        _;
    }

    // =================================================================================================
    // Constructor
    // =================================================================================================

    constructor() Ownable(msg.sender) {}

    // =================================================================================================
    // Deposit / Withdraw Functions
    // =================================================================================================

    function deposit(address token, uint256 amount) external override whenNotPaused {
        require(amount > 0, "Vault: Deposit amount must be positive");
        userBalances[msg.sender][token] += amount;
        
        // Chuyển token từ ví người dùng vào hợp đồng Vault này
        IERC20(token).transferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external override whenNotPaused {
        require(amount > 0, "Vault: Withdraw amount must be positive");
        uint256 availableBalance = userBalances[msg.sender][token] - lockedBalances[msg.sender][token];
        require(availableBalance >= amount, "Vault: Insufficient available balance");
        
        userBalances[msg.sender][token] -= amount;

        // Chuyển token từ hợp đồng Vault này về lại ví người dùng
        IERC20(token).transfer(msg.sender, amount);

        emit Withdrawn(msg.sender, token, amount);
    }

    // =================================================================================================
    // Trading Balance Management (Called by Executors)
    // =================================================================================================

    function lockBalance(address user, address token, uint256 amount) external override onlyExecutor whenNotPaused {
        uint256 availableBalance = userBalances[user][token] - lockedBalances[user][token];
        require(availableBalance >= amount, "Vault: Insufficient available balance for lock");
        lockedBalances[user][token] += amount;
    }

    function unlockBalance(address user, address token, uint256 amount) external override onlyExecutor whenNotPaused {
        require(lockedBalances[user][token] >= amount, "Vault: Unlocking more than locked");
        lockedBalances[user][token] -= amount;
    }

    // =================================================================================================
    // Settlement (Called by Executors)
    // =================================================================================================

    function executeTransfer(address from, address to, address token, uint256 amount) external override onlyExecutor whenNotPaused {
        require(userBalances[from][token] >= amount, "Vault: Insufficient balance for transfer");
        // Chuyển tiền chỉ là cập nhật số dư nội bộ
        userBalances[from][token] -= amount;
        userBalances[to][token] += amount;
    }

    // =================================================================================================
    // Balance Query Functions
    // =================================================================================================

    function getBalance(address user, address token) external view override returns (uint256) {
        return userBalances[user][token];
    }

    function getAvailableBalance(address user, address token) external view override returns (uint256) {
        return userBalances[user][token] - lockedBalances[user][token];
    }

    function getLockedBalance(address user, address token) external view override returns (uint256) {
        return lockedBalances[user][token];
    }

    // =================================================================================================
    // Admin & Safety Functions (Called by Owner)
    // =================================================================================================

    function authorizeExecutor(address executor, bool isAuthorized) external override onlyOwner {
        authorizedExecutors[executor] = isAuthorized;
    }

    function pause() external override onlyOwner {
        _pause();
    }

    function unpause() external override onlyOwner {
        _unpause();
    }
}