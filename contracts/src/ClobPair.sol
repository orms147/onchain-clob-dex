// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./libraries/OrderStructs.sol";
import "./libraries/SegmentTree.sol";
import "./interfaces/IVault.sol";
/**
 * @title ClobPair
 * @notice Một cặp giao dịch trong CLOB on-chain
 */
contract ClobPair {
    address public tokenBase;
    address public tokenQuote;
    uint256 public tickSize;

    SegmentTree public bids; // best bid = highest tick có liquidity
    SegmentTree public asks; // best ask = lowest tick có liquidity

    IVault public vault;

    struct PriceLevel {
        uint256 totalVolume;
        uint256[] orderIds;
    }

    mapping(uint256 => PriceLevel) public orderBook; // tick => price level

    constructor(
        address _tokenBase,
        address _tokenQuote,
        uint256 _tickSize,
        address _vault
    ) {
        tokenBase = _tokenBase;
        tokenQuote = _tokenQuote;
        tickSize = _tickSize;
        vault = IVault(_vault);

        bids = new SegmentTree(65536);
        asks = new SegmentTree(65536);
    }

    function placeOrder(OrderStructs.LimitOrder calldata order) external {
        // 1. Transfer funds to Vault
        // 2. Add to orderBook mapping
        // 3. Update SegmentTree (bids hoặc asks tùy order.side)
    }

    function cancelOrder(uint256 orderId) external {
        // 1. Remove from orderBook
        // 2. Update SegmentTree nếu price level rỗng
        // 3. Unlock funds from Vault
    }

    function matchOrders() external {
        // Khớp best bid và best ask nếu giá hợp lệ
        // Update cả hai SegmentTree sau mỗi lần khớp
    }

    function getBestBid() external view returns (uint256) {
        // Lấy tick cao nhất từ bids SegmentTree
    }

    function getBestAsk() external view returns (uint256) {
        // Lấy tick thấp nhất từ asks SegmentTree
    }
}
