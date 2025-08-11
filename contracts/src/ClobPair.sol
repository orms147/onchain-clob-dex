// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./interfaces/IClobPair.sol";
import "./interfaces/IVault.sol";
import "./libraries/SegmentedSegmentTree.sol";
import "./libraries/DirtyUint64.sol";
import "./libraries/PackedUint256.sol";
import "./libraries/OrderStructs.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ClobPair is IClobPair, ReentrancyGuard {
    using SegmentedSegmentTree for SegmentedSegmentTree.Core;
    using DirtyUint64 for uint64;
    using PackedUint256 for uint256;

    // ---- Immutables ----
    address public immutable baseToken;
    address public immutable quoteToken;
    uint32 public immutable tickSize;
    address public immutable vault;
    address public immutable factory;
    
    // ---- Constants ----
    uint256 private constant MAX_TICK_INDEX = 32767; // 2^15 - 1
    
    // ---- Order Management ----
    struct OrderNode {
        uint64 prev;            // orderId trước (0 = none)
        uint64 next;            // orderId sau (0 = none)
        address maker;          // chủ lệnh
        uint128 remainingBase;  // khối lượng base còn lại
        uint256 price;          // giá của lệnh
        bool isSellBase;        // true = sell base, false = buy base
        uint64 nonce;           // nonce của maker
        uint64 expiry;          // thời gian hết hạn
    }

    // Hàng đợi cho 1 mức giá (tick)
    struct LevelQueue {
        uint64 head;          // orderId ở đầu hàng
        uint64 tail;          // orderId ở cuối hàng
        uint64 length;        // số lệnh trong hàng
        uint128 aggBase;      // tổng base còn lại tại mức giá này
        mapping(uint64 => OrderNode) orders; // orderId -> order node
    }

    // Một phía sổ lệnh (bids hoặc asks)
    struct BookSide {
        SegmentedSegmentTree.Core tree;          // SST: leaf = aggBase của tick
        mapping(uint32 => LevelQueue) levels;    // tickIndex -> FIFO queue
        uint64 nextOrderId;                      // tăng dần để gán orderId
    }

    BookSide private bids;   // buy orders (bid side)
    BookSide private asks;   // sell orders (ask side)

    // ---- Order Tracking ----
    mapping(bytes32 => uint64) public orderHashToId;           // orderHash -> internal orderId
    mapping(uint64 => bytes32) public orderIdToHash;           // internal orderId -> orderHash
    mapping(uint64 => bool) public orderIsBid;                 // orderId -> true if bid, false if ask
    mapping(uint64 => uint32) public orderTickIndex;           // orderId -> tick index
    mapping(address => bytes32[]) private userOrders;          // user -> orderHashes[]

    // ---- Constructor ----
    constructor(
        address _baseToken,
        address _quoteToken,
        uint32 _tickSize,
        address _vault
    ) {
        require(_baseToken != address(0) && _quoteToken != address(0), "ZERO_ADDRESS");
        require(_baseToken != _quoteToken, "IDENTICAL_TOKENS");
        require(_tickSize > 0, "ZERO_TICK_SIZE");
        require(_vault != address(0), "ZERO_VAULT");

        baseToken = _baseToken;
        quoteToken = _quoteToken;
        tickSize = _tickSize;
        vault = _vault;
        factory = msg.sender;
    }

    // ---- Modifiers ----
    modifier validPrice(uint256 price) {
        require(price > 0 && price % tickSize == 0, "INVALID_PRICE");
        uint256 tickIndex = price / tickSize;
        require(tickIndex <= MAX_TICK_INDEX, "PRICE_TOO_HIGH");
        _;
    }

    modifier onlyMaker(bytes32 orderHash) {
        uint64 orderId = orderHashToId[orderHash];
        require(orderId != 0, "ORDER_NOT_FOUND");
        
        bool isBid = orderIsBid[orderId];
        uint32 idx = orderTickIndex[orderId];
        
        OrderNode storage node = isBid ? 
            bids.levels[idx].orders[orderId] : 
            asks.levels[idx].orders[orderId];
            
        require(node.maker == msg.sender, "NOT_MAKER");
        _;
    }

    // ---- Internal Helpers ----
    function _tickIndex(uint256 price) internal view returns (uint32) {
        return uint32(price / tickSize);
    }

    function _hashOrder(OrderStructs.LimitOrder calldata order) internal pure returns (bytes32) {
        return keccak256(abi.encode(order));
    }

    function _isExpired(uint64 expiry) internal view returns (bool) {
        return expiry != 0 && block.timestamp > expiry;
    }

    // ---- FIFO Queue Operations ----
    function _enqueue(
        BookSide storage side,
        uint32 idx,
        OrderStructs.LimitOrder memory order
    ) internal returns (uint64 orderId) {
        LevelQueue storage level = side.levels[idx];
        
        orderId = ++side.nextOrderId;
        OrderNode storage node = level.orders[orderId];
        
        node.maker = order.maker;
        node.remainingBase = order.baseAmount;
        node.price = order.price;
        node.isSellBase = order.isSellBase;
        node.nonce = order.nonce;
        node.expiry = order.expiry;

        // Link to queue
        if (level.tail == 0) {
            // Empty queue
            level.head = orderId;
            level.tail = orderId;
        } else {
            // Add to tail
            node.prev = level.tail;
            level.orders[level.tail].next = orderId;
            level.tail = orderId;
        }
        
        unchecked { 
            level.length += 1;
            level.aggBase += order.baseAmount;
        }

        // Update SST leaf - Sử dụng DirtyUint64 để đảm bảo đúng định dạng
        uint64 newValue = 0;
        if (level.aggBase <= type(uint64).max) {
            newValue = uint64(level.aggBase);
        } else {
            newValue = type(uint64).max;
        }
        
        side.tree.update(idx, newValue);
        
        return orderId;
    }

    function _removeOrder(
        BookSide storage side,
        uint32 idx,
        uint64 orderId
    ) internal returns (OrderNode memory node) {
        LevelQueue storage level = side.levels[idx];
        OrderNode storage order = level.orders[orderId];
        require(order.maker != address(0), "ORDER_NOT_FOUND");

        node = order; // Copy to memory

        uint64 prev = order.prev;
        uint64 next = order.next;

        // Update links
        if (prev == 0) {
            level.head = next;
        } else {
            level.orders[prev].next = next;
        }

        if (next == 0) {
            level.tail = prev;
        } else {
            level.orders[next].prev = prev;
        }

        // Update aggregates
        unchecked {
            level.length -= 1;
            level.aggBase -= node.remainingBase;
        }

        // Clean up
        delete level.orders[orderId];

        // Update SST - Sử dụng định dạng đúng cho SST
        uint64 newValue = 0;
        if (level.aggBase <= type(uint64).max) {
            newValue = uint64(level.aggBase);
        } else {
            newValue = type(uint64).max;
        }
        
        side.tree.update(idx, newValue);

        return node;
    }

    function _partialFill(
        BookSide storage side,
        uint32 idx,
        uint64 orderId,
        uint128 fillAmount
    ) internal {
        LevelQueue storage level = side.levels[idx];
        OrderNode storage order = level.orders[orderId];
        
        require(order.remainingBase >= fillAmount, "INSUFFICIENT_REMAINING");
        
        unchecked {
            order.remainingBase -= fillAmount;
            level.aggBase -= fillAmount;
        }

        // Update SST - Sử dụng định dạng đúng cho SST
        uint64 newValue = 0;
        if (level.aggBase <= type(uint64).max) {
            newValue = uint64(level.aggBase);
        } else {
            newValue = type(uint64).max;
        }
        
        side.tree.update(idx, newValue);
    }

    // Helper function to remove order from user list
    function _removeFromUserOrders(address user, bytes32 orderHash) internal {
        bytes32[] storage orders = userOrders[user];
        for (uint256 i = 0; i < orders.length; i++) {
            if (orders[i] == orderHash) {
                orders[i] = orders[orders.length - 1];
                orders.pop();
                break;
            }
        }
    }

    // ---- SST Extensions ----
    // Tìm tick đầu tiên có thanh khoản > 0 trong khoảng [left, right)
    function _findFirstNonZero(
        SegmentedSegmentTree.Core storage tree, 
        uint256 left, 
        uint256 right
    ) internal view returns (bool found, uint32 idx) {
        require(left < right, "INVALID_RANGE");
        
        // Kiểm tra nhanh xem có bất kỳ thanh khoản nào trong khoảng không
        if (tree.query(left, right) == 0) {
            return (false, 0);
        }
        
        // Binary search để tìm non-zero leaf đầu tiên
        uint256 lo = left;
        uint256 hi = right - 1;
        
        while (lo <= hi) {
            uint256 mid = (lo + hi) / 2;
            
            if (tree.get(mid) > 0) {
                // Nếu leaf hiện tại > 0, tìm bên trái nếu có thể
                if (mid == left || tree.get(mid - 1) == 0) {
                    return (true, uint32(mid));
                }
                hi = mid - 1;
            } else {
                // Nếu leaf hiện tại = 0, tìm bên phải
                lo = mid + 1;
            }
        }
        
        // Nếu không tìm thấy leaf > 0 nào
        return (false, 0);
    }

    // Tìm tick cuối cùng có thanh khoản > 0 trong khoảng [left, right)
    function _findLastNonZero(
        SegmentedSegmentTree.Core storage tree, 
        uint256 left, 
        uint256 right
    ) internal view returns (bool found, uint32 idx) {
        require(left < right, "INVALID_RANGE");
        
        // Kiểm tra nhanh xem có bất kỳ thanh khoản nào trong khoảng không
        if (tree.query(left, right) == 0) {
            return (false, 0);
        }
        
        // Binary search để tìm non-zero leaf cuối cùng
        uint256 lo = left;
        uint256 hi = right - 1;
        
        while (lo <= hi) {
            uint256 mid = (lo + hi) / 2;
            
            if (tree.get(mid) > 0) {
                // Nếu leaf hiện tại > 0, tìm bên phải nếu có thể
                if (mid == right - 1 || tree.get(mid + 1) == 0) {
                    return (true, uint32(mid));
                }
                lo = mid + 1;
            } else {
                // Nếu leaf hiện tại = 0, tìm bên trái
                hi = mid - 1;
            }
        }
        
        // Nếu không tìm thấy leaf > 0 nào
        return (false, 0);
    }

    // ---- Matching Engine ----
    function _matchOrder(
        OrderStructs.LimitOrder calldata order
    ) internal returns (uint128 totalBaseFilled) {
        uint32 limitIdx = _tickIndex(order.price);
        uint128 remaining = order.baseAmount;

        if (order.isSellBase) {
            // Sell order matches against bids (buy orders)
            remaining = _matchAgainstBids(order.maker, remaining, limitIdx);
        } else {
            // Buy order matches against asks (sell orders)  
            remaining = _matchAgainstAsks(order.maker, remaining, limitIdx);
        }

        return order.baseAmount - remaining;
    }

    function _matchAgainstBids(
        address taker,
        uint128 baseToSell,
        uint32 minPriceIdx
    ) internal returns (uint128 remaining) {
        remaining = baseToSell;

        while (remaining > 0) {
            // Find best bid >= minPriceIdx
            (bool found, uint32 idx) = _findBestBid(minPriceIdx);
            if (!found) break;

            remaining = _fillAtLevel(bids, idx, taker, remaining, false);
        }
    }

    function _matchAgainstAsks(
        address taker,
        uint128 baseToBuy,
        uint32 maxPriceIdx
    ) internal returns (uint128 remaining) {
        remaining = baseToBuy;

        while (remaining > 0) {
            // Find best ask <= maxPriceIdx
            (bool found, uint32 idx) = _findBestAsk(maxPriceIdx);
            if (!found) break;

            remaining = _fillAtLevel(asks, idx, taker, remaining, true);
        }
    }

    function _fillAtLevel(
        BookSide storage side,
        uint32 idx,
        address taker,
        uint128 remaining,
        bool takerIsBuying
    ) internal returns (uint128 stillRemaining) {
        LevelQueue storage level = side.levels[idx];
        uint64 orderId = level.head;
        stillRemaining = remaining;

        while (orderId != 0 && stillRemaining > 0) {
            OrderNode storage order = level.orders[orderId];
            
            // Check expiry
            if (_isExpired(order.expiry)) {
                uint64 nextId = order.next;
                OrderNode memory expiredNode = _removeOrder(side, idx, orderId);
                
                // Unlock expired order's funds
                if (expiredNode.isSellBase) {
                    IVault(vault).unlock(expiredNode.maker, baseToken, expiredNode.remainingBase);
                } else {
                    uint128 quoteToUnlock = uint128((uint256(expiredNode.remainingBase) * expiredNode.price) / 1e18);
                    IVault(vault).unlock(expiredNode.maker, quoteToken, quoteToUnlock);
                }
                
                // Clean up tracking for expired order
                bytes32 expiredHash = orderIdToHash[orderId];
                delete orderHashToId[expiredHash];
                delete orderIdToHash[orderId];
                delete orderIsBid[orderId];
                delete orderTickIndex[orderId];
                _removeFromUserOrders(expiredNode.maker, expiredHash);
                
                orderId = nextId;
                continue;
            }

            uint128 fillAmount = order.remainingBase > stillRemaining ? 
                stillRemaining : order.remainingBase;

            // Execute trade
            _executeTrade(
                order.maker,
                taker,
                fillAmount,
                order.price,
                takerIsBuying
            );

            // Emit fill event
            bytes32 orderHash = orderIdToHash[orderId];
            bool isFinal = order.remainingBase == fillAmount;
            
            emit OrderFilled(
                orderHash,
                order.maker,
                taker,
                fillAmount,
                uint128((uint256(fillAmount) * order.price) / 1e18),
                order.price,
                isFinal
            );

            stillRemaining -= fillAmount;

            if (order.remainingBase == fillAmount) {
                // Order fully filled - remove it
                uint64 nextId = order.next;
                _removeOrder(side, idx, orderId);
                
                // Clean up tracking
                delete orderHashToId[orderHash];
                delete orderIdToHash[orderId];
                delete orderIsBid[orderId];
                delete orderTickIndex[orderId];
                _removeFromUserOrders(order.maker, orderHash);
                
                orderId = nextId;
            } else {
                // Partial fill
                _partialFill(side, idx, orderId, fillAmount);
                break; // Taker order fully filled
            }
        }

        return stillRemaining;
    }

    function _executeTrade(
        address maker,
        address taker,
        uint128 baseAmount,
        uint256 price,
        bool takerIsBuying
    ) internal {
        require(baseAmount > 0, "ZERO_AMOUNT");
        uint128 quoteAmount = uint128((uint256(baseAmount) * price) / 1e18);
        require(quoteAmount > 0, "ZERO_QUOTE");

        if (takerIsBuying) {
            // Taker buys base, pays quote
            // Maker sells base, receives quote
            IVault(vault).moveLocked(baseToken, maker, taker, baseAmount);
            IVault(vault).moveLocked(quoteToken, taker, maker, quoteAmount);
        } else {
            // Taker sells base, receives quote  
            // Maker buys base, pays quote
            IVault(vault).moveLocked(baseToken, taker, maker, baseAmount);
            IVault(vault).moveLocked(quoteToken, maker, taker, quoteAmount);
        }
    }

    // ---- SST Queries ----
    function _findBestBid(uint32 minIdx) internal view returns (bool found, uint32 idx) {
        // Find highest price bid >= minIdx
        return _findLastNonZero(bids.tree, minIdx, MAX_TICK_INDEX + 1);
    }

    function _findBestAsk(uint32 maxIdx) internal view returns (bool found, uint32 idx) {
        // Find lowest price ask <= maxIdx  
        return _findFirstNonZero(asks.tree, 0, maxIdx + 1);
    }

    // ---- Public Interface ----
    function placeLimitOrder(OrderStructs.LimitOrder calldata order) 
        external 
        nonReentrant
        validPrice(order.price)
        returns (bytes32 orderHash, uint64 orderId) 
    {
        require(order.maker == msg.sender, "INVALID_MAKER");
        require(order.baseToken == baseToken && order.quoteToken == quoteToken, "INVALID_TOKENS");
        require(order.baseAmount > 0, "ZERO_AMOUNT");
        require(!_isExpired(order.expiry), "EXPIRED");

        orderHash = _hashOrder(order);
        require(orderHashToId[orderHash] == 0, "DUPLICATE_ORDER");

        // Lock funds in vault
        if (order.isSellBase) {
            IVault(vault).lock(order.maker, baseToken, order.baseAmount);
        } else {
            // Check overflow before calculation
            require(order.baseAmount <= type(uint128).max / order.price * 1e18, "OVERFLOW");
            uint128 quoteNeeded = uint128((uint256(order.baseAmount) * order.price) / 1e18);
            require(quoteNeeded > 0, "ZERO_QUOTE_NEEDED");
            IVault(vault).lock(order.maker, quoteToken, quoteNeeded);
        }

        // Try to match against existing orders
        uint128 filledAmount = _matchOrder(order);
        uint128 remainingAmount = order.baseAmount - filledAmount;

        // If there's remaining amount, add to book
        if (remainingAmount > 0) {
            OrderStructs.LimitOrder memory remainingOrder = order;
            remainingOrder.baseAmount = remainingAmount;

            uint32 idx = _tickIndex(order.price);
            
            if (order.isSellBase) {
                orderId = _enqueue(asks, idx, remainingOrder);
                orderIsBid[orderId] = false;
            } else {
                orderId = _enqueue(bids, idx, remainingOrder);
                orderIsBid[orderId] = true;
            }

            // Track order
            orderHashToId[orderHash] = orderId;
            orderIdToHash[orderId] = orderHash;
            orderTickIndex[orderId] = idx;
            userOrders[order.maker].push(orderHash);

            emit OrderPlaced(orderHash, order, orderId);
        }
        
        return (orderHash, orderId);
    }

    function cancelOrderByHash(bytes32 orderHash) external nonReentrant onlyMaker(orderHash) {
        uint64 orderId = orderHashToId[orderHash];
        bool isBid = orderIsBid[orderId];
        uint32 idx = orderTickIndex[orderId];

        // Remove from book
        OrderNode memory node = isBid ? 
            _removeOrder(bids, idx, orderId) : 
            _removeOrder(asks, idx, orderId);

        // Unlock funds
        if (node.isSellBase) {
            IVault(vault).unlock(node.maker, baseToken, node.remainingBase);
        } else {
            uint128 quoteToUnlock = uint128((uint256(node.remainingBase) * node.price) / 1e18);
            IVault(vault).unlock(node.maker, quoteToken, quoteToUnlock);
        }

        // Clean up tracking
        delete orderHashToId[orderHash];
        delete orderIdToHash[orderId];
        delete orderIsBid[orderId];
        delete orderTickIndex[orderId];

        // Remove from user's order list
        _removeFromUserOrders(node.maker, orderHash);

        emit OrderCancelled(orderHash, node.maker, orderId);
    }

    function cancelOrder(OrderStructs.LimitOrder calldata order) external {
        bytes32 orderHash = _hashOrder(order);
        cancelOrderByHash(orderHash);
    }

    // ---- View Functions ----
    function getOrderInfo(bytes32 orderHash) external view returns (OrderStructs.OrderInfo memory info) {
        uint64 orderId = orderHashToId[orderHash];
        if (orderId == 0) {
            info.status = OrderStructs.OrderStatus.NotFound;
            return info;
        }

        bool isBid = orderIsBid[orderId];
        uint32 idx = orderTickIndex[orderId];
        
        OrderNode storage node = isBid ? 
            bids.levels[idx].orders[orderId] : 
            asks.levels[idx].orders[orderId];

        if (_isExpired(node.expiry)) {
            info.status = OrderStructs.OrderStatus.Expired;
        } else {
            info.status = OrderStructs.OrderStatus.Open;
        }
        
        info.remainingAmount = node.remainingBase;
    }

    function getUserOrders(address user) external view returns (bytes32[] memory) {
        return userOrders[user];
    }

    function getPairInfo() external view returns (address, address, uint32) {
        return (baseToken, quoteToken, tickSize);
    }

    function getVault() external view returns (address) {
        return vault;
    }

    function getBestBid() external view returns (bool exists, uint256 price, uint128 totalBase) {
        uint32 idx;
        (exists, idx) = _findBestBid(0);
        if (exists) {
            price = uint256(idx) * tickSize;
            totalBase = bids.levels[idx].aggBase;
        }
    }

    function getBestAsk() external view returns (bool exists, uint256 price, uint128 totalBase) {
        uint32 idx;
        (exists, idx) = _findBestAsk(MAX_TICK_INDEX);
        if (exists) {
            price = uint256(idx) * tickSize;
            totalBase = asks.levels[idx].aggBase;
        }
    }

    function getPriceLevel(uint256 price) external view validPrice(price) returns (uint128 totalBase, uint64 orderCount) {
        uint32 idx = _tickIndex(price);
        LevelQueue storage bidLevel = bids.levels[idx];
        LevelQueue storage askLevel = asks.levels[idx];
        
        totalBase = bidLevel.aggBase + askLevel.aggBase;
        orderCount = bidLevel.length + askLevel.length;
    }
}