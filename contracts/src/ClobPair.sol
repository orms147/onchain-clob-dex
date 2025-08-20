// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./interfaces/IClobPair.sol";
import "./interfaces/IVault.sol";
import "./libraries/SegmentedSegmentTree.sol";
import "./libraries/DirtyUint64.sol";
import "./libraries/PackedUint256.sol";
import "./libraries/OrderStructs.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract ClobPair is IClobPair, ReentrancyGuard, EIP712 {
    using SegmentedSegmentTree for SegmentedSegmentTree.Core;
    using DirtyUint64 for uint64;
    using PackedUint256 for uint256;

    // ---- Immutables ----
    address public immutable baseToken;
    address public immutable quoteToken;
    uint256 public immutable tickSize;
    address public immutable vault;
    
    // ---- Constants ----
    uint32 private constant MAX_TICK_INDEX = 32767;
    
    // ---- Order Management ----
    struct OrderNode {
        uint64 prev;    //prev order id
        uint64 next;    //next order id
        address maker;  //order maker
        uint64 remainingBase; //remaining base amount 
        uint256 price; //order price
        bool isSellBase; //true if sell baseToken order, false if buy
        uint256 nonce; //order nonce
        uint256 expiry; //order expiry
        bytes32 orderHash; //order hash
    }

    struct LevelQueue {
        uint64 head;    //head order id
        uint64 tail;    //tail order id
        uint64 length;  //number of orders in the level
        uint64 totalBaseAmount; //total base amount in the level
        mapping(uint64 => OrderNode) orders; // orderId -> order node
    }

    struct BookSide {
        SegmentedSegmentTree.Core tree; //segmented segment tree for order aggregation
        mapping(uint256 => LevelQueue) levels; //tickIndex -> level queue (FIFO) - Changed from uint32 to uint256
        uint64 totalOrdersCreated; //total number of orders ever created in this side
    }

    BookSide private bids;  //buy order
    BookSide private asks;  //sell order

    // ---- Order Tracking ----
    mapping(bytes32 => uint64) public orderHashToId;    //orderHash -> orderId   
    mapping(uint64 => bool) public orderIsBid;          //orderId -> true if buy baseTkn, false if sell
    mapping(uint64 => uint256) public orderTickIndex;   //orderId -> tickIndex - Changed from uint32 to uint256
    mapping(address => bytes32[]) private userOrders; //user -> orderHashes

    // ---- Constants for EIP-712 ----
    bytes32 private constant LIMIT_ORDER_TYPEHASH = keccak256(
        "LimitOrder(address maker,address baseToken,address quoteToken,uint64 baseAmount,uint256 price,bool isSellBase,uint256 expiry,uint256 nonce)"
    );

    // ---- Constructor ----
    constructor(address _baseToken, address _quoteToken, uint256 _tickSize, address _vault) 
        EIP712("ClobRouter", "1") 
    {
        require(_baseToken != address(0) && _quoteToken != address(0), "ZERO_ADDRESS");
        require(_baseToken != _quoteToken, "IDENTICAL_TOKENS");
        require(_tickSize > 0, "ZERO_TICK_SIZE");
        require(_vault != address(0), "ZERO_VAULT");

        baseToken = _baseToken;
        quoteToken = _quoteToken;
        tickSize = _tickSize;
        vault = _vault;
    }

    // ---- Modifiers ----
    modifier validPrice(uint256 price) {
        require(price > 0 && price % tickSize == 0, "INVALID_PRICE");

        _;
    }

    modifier onlyMaker(bytes32 orderHash) {
        OrderNode storage node = _getOrderNode(orderHash);
        require(node.maker == msg.sender, "NOT_MAKER");
        _;
    }

    // ---- Helper Functions ----
    function _tickIndex(uint256 price) internal view returns (uint256) {
        return price / tickSize;
    }

    function _mapTickIndexToSST(uint256 tickIndex) internal pure returns (uint32) {
        if (tickIndex <= 32767) {
            return uint32(tickIndex);
        } else {
            return uint32(tickIndex % 32768);
        }
    }

    function _hashOrder(OrderStructs.LimitOrder calldata order) internal view returns (bytes32) {

        return _hashTypedDataV4(keccak256(abi.encode(
            LIMIT_ORDER_TYPEHASH,
            order.maker,
            order.baseToken,
            order.quoteToken,
            order.baseAmount,
            order.price,
            order.isSellBase,
            order.expiry,
            order.nonce
        )));
    }

    function _isExpired(uint256 expiry) internal view returns (bool) {
        return expiry != 0 && block.timestamp > expiry;
    }

    function _getOrderNode(bytes32 orderHash) internal view returns (OrderNode storage node) {
        uint64 orderId = orderHashToId[orderHash];
        require(orderId != 0, "ORDER_NOT_FOUND");
        
        bool isBid = orderIsBid[orderId];
        uint256 idx = orderTickIndex[orderId];
        
        return isBid ? bids.levels[idx].orders[orderId] : asks.levels[idx].orders[orderId];
    }


    function _updateSST(BookSide storage side, uint256 idx, uint64 totalBaseAmount) internal {
        uint32 sstIdx = _mapTickIndexToSST(idx);
        side.tree.update(sstIdx, totalBaseAmount);
    }

    function _removeFromUserOrders(address user, bytes32 orderHash) internal {
        bytes32[] storage orders = userOrders[user];
        uint256 length = orders.length;
        
        for(uint256 i = 0; i < length; i++) {
            if(orders[i] == orderHash) {
                if (length > 1) {
                    orders[i] = orders[length - 1];
                }
                orders.pop();
                break;
            }
        }
    }

    function _cleanupOrder(uint64 orderId, bytes32 orderHash, address maker) internal {
        delete orderHashToId[orderHash];
        delete orderIsBid[orderId];
        delete orderTickIndex[orderId];
        _removeFromUserOrders(maker, orderHash);
    }

    function _unlockFunds(OrderNode memory node) internal {
        if (node.isSellBase) {
            IVault(vault).unlockBalance(node.maker, baseToken, node.remainingBase);
        } else {
            uint64 quoteToUnlock = uint64((uint256(node.remainingBase) * node.price) / 1e18);
            IVault(vault).unlockBalance(node.maker, quoteToken, quoteToUnlock);
        }
    }

    // ---- FIFO Queue Operations ----
    function _enqueue(BookSide storage side, uint256 idx, OrderStructs.LimitOrder memory order, bytes32 orderHash) 
        internal returns (uint64 orderId) 
    {
        LevelQueue storage levelQueue = side.levels[idx];
        orderId = ++side.totalOrdersCreated;
        OrderNode storage node = levelQueue.orders[orderId];
        

        node.maker = order.maker;
        node.remainingBase = order.baseAmount;
        node.price = order.price;
        node.isSellBase = order.isSellBase;
        node.nonce = order.nonce;
        node.expiry = order.expiry;
        node.orderHash = orderHash;

        // Link to queue
        if (levelQueue.tail == 0) {
            levelQueue.head = orderId;
            levelQueue.tail = orderId;
        } else {

            node.prev = levelQueue.tail;
            levelQueue.orders[levelQueue.tail].next = orderId;
            levelQueue.tail = orderId;
        }
        
        unchecked { 
            levelQueue.length += 1;
            levelQueue.totalBaseAmount += order.baseAmount;
        }

        _updateSST(side, idx, levelQueue.totalBaseAmount);
        return orderId;
    }

    function _removeOrder(BookSide storage side, uint256 idx, uint64 orderId) 
        internal returns (OrderNode memory node) 
    {
        LevelQueue storage levelQueue = side.levels[idx];
        OrderNode storage order = levelQueue.orders[orderId];
        require(order.maker != address(0), "ORDER_NOT_FOUND");

        node = order;

        uint64 prev = order.prev;
        uint64 next = order.next;

        // Update links
        if (prev == 0) {
            levelQueue.head = next;
        } else {
            levelQueue.orders[prev].next = next;
        }

        if (next == 0) {
            levelQueue.tail = prev;
        } else {
            levelQueue.orders[next].prev = prev;
        }

        // Update aggregates
        unchecked {
            levelQueue.length -= 1;
            levelQueue.totalBaseAmount -= node.remainingBase;
        }

        delete levelQueue.orders[orderId];
        _updateSST(side, idx, levelQueue.totalBaseAmount);
        return node;
    }

    function _partialFill(BookSide storage side, uint256 idx, uint64 orderId, uint64 fillAmount) internal {
        LevelQueue storage levelQueue = side.levels[idx];
        OrderNode storage order = levelQueue.orders[orderId];
        
        require(order.remainingBase >= fillAmount, "INSUFFICIENT_REMAINING");
        
        unchecked {
            order.remainingBase -= fillAmount;
            levelQueue.totalBaseAmount -= fillAmount;
        }

        _updateSST(side, idx, levelQueue.totalBaseAmount);
    }

    // ---- SST Extensions ----
    //Best ask
    function _findFirstNonZero(SegmentedSegmentTree.Core storage tree, uint32 left, uint32 right) 
        internal view returns (bool found, uint32 idx) 
    {
        require(left < right, "INVALID_RANGE");
        
        if (tree.query(left, right) == 0) return (false, 0);
        
        uint32 lo = left;
        uint32 hi = right - 1;
        

        while (lo <= hi) {
            uint32 mid = (lo + hi) / 2;
            
            if (tree.get(mid) > 0) {
                if (mid == left || tree.get(mid - 1) == 0) {
                    return (true, mid);
                }
                hi = mid - 1;
            } else {
                lo = mid + 1;
            }
        }
        
        return (false, 0);
    }

    //Best bid
    function _findLastNonZero(SegmentedSegmentTree.Core storage tree, uint32 left, uint32 right) 
        internal view returns (bool found, uint32 idx) 
    {
        require(left < right, "INVALID_RANGE");
        
        if (tree.query(left, right) == 0) return (false, 0);
        
        uint32 lo = left;
        uint32 hi = right - 1;
        
        while (lo <= hi) {
            uint32 mid = (lo + hi) / 2;
            
            if (tree.get(mid) > 0) {
                if (mid == right - 1 || tree.get(mid + 1) == 0) {
                    return (true, mid);
                }
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        
        return (false, 0);
    }

    // ---- Matching Engine ----
    function _matchOrder(OrderStructs.LimitOrder calldata order) internal returns (uint64 totalBaseFilled) {
        uint256 limitIdx = _tickIndex(order.price);
        uint64 remaining = order.baseAmount;   

        // Log initial state
        emit DebugPriceInfo(
            order.price,
            limitIdx,
            tickSize,
            !order.isSellBase
        );

        // Log order book state before matching
        (uint64 bidLen, uint64 bidBase, uint64 askLen, uint64 askBase) = this.getOrderBookState(order.price);
        emit DebugOrderBook(
            order.price,
            bidLen,
            bidBase,
            askLen,
            askBase
        );

        if (order.isSellBase) {
            remaining = _matchAgainstBids(order.maker, remaining, limitIdx);
        } else {
            remaining = _matchAgainstAsks(order.maker, remaining, limitIdx);
        }

        return order.baseAmount - remaining;
    }

    function _matchAgainstBids(address taker, uint64 baseToSell, uint256 minPriceIdx) 
        internal returns (uint64 remaining)
    {
        remaining = baseToSell;

        while (remaining > 0) {
            (bool found, uint256 idx) = _findBestBid(minPriceIdx);
            
            // Log matching attempt
            emit DebugMatching(
                keccak256(abi.encodePacked(taker, baseToSell, minPriceIdx)),
                minPriceIdx * tickSize,
                remaining,
                found,
                found ? (idx * tickSize) : 0
            );

            if (!found) break;
            remaining = _fillAtLevel(bids, idx, taker, remaining, false);
        }
    }

    function _matchAgainstAsks(address taker, uint64 baseToBuy, uint256 maxPriceIdx) 
        internal returns (uint64 remaining)
    {
        remaining = baseToBuy;

        while (remaining > 0) {
            (bool found, uint256 idx) = _findBestAsk(maxPriceIdx);
            
            // Log matching attempt
            emit DebugMatching(
                keccak256(abi.encodePacked(taker, baseToBuy, maxPriceIdx)),
                maxPriceIdx * tickSize,
                remaining,
                found,
                found ? (idx * tickSize) : 0
            );

            if (!found) break;
            remaining = _fillAtLevel(asks, idx, taker, remaining, true);
        }
    }

    function _fillAtLevel(BookSide storage side, uint256 idx, address taker, uint64 remaining, bool IsBuying) 
        internal returns (uint64 stillRemaining)
    {
        LevelQueue storage levelQueue = side.levels[idx];
        uint64 orderId = levelQueue.head;
        stillRemaining = remaining;

        while (orderId != 0 && stillRemaining > 0) {
            OrderNode storage order = levelQueue.orders[orderId];
            
            // Prevent self-matching: Skip orders from same maker
            if (order.maker == taker) {
                orderId = order.next;
                continue;
            }
            
            // Check expiry
            if (_isExpired(order.expiry)) {
                uint64 nextId = order.next;
                OrderNode memory expiredNode = _removeOrder(side, idx, orderId);
                _unlockFunds(expiredNode);
                _cleanupOrder(orderId, expiredNode.orderHash, expiredNode.maker);
                orderId = nextId;
                continue;
            }

            uint64 fillAmount = order.remainingBase > stillRemaining ? stillRemaining : order.remainingBase;

            // Execute trade
            _executeTrade(order.maker, taker, fillAmount, order.price, IsBuying);

            // Emit fill event
            bool isFinal = order.remainingBase == fillAmount;
            emit OrderFilled(
                order.orderHash,
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
                _cleanupOrder(orderId, order.orderHash, order.maker);
                orderId = nextId;
            } else {
                // Partial fill
                _partialFill(side, idx, orderId, fillAmount);
                break;
            }
        }

        return stillRemaining;
    }

    function _executeTrade(address maker, address taker, uint64 baseAmount, uint256 price, bool IsBuying) internal {
        require(baseAmount > 0, "ZERO_AMOUNT");
        uint64 quoteAmount = uint64((uint256(baseAmount) * price) / 1e18);
        require(quoteAmount > 0, "ZERO_QUOTE");

        if (IsBuying) {
            IVault(vault).executeTransfer(maker, taker, baseToken, baseAmount);
            IVault(vault).executeTransfer(taker, maker, quoteToken, quoteAmount);
        } else {
            IVault(vault).executeTransfer(taker, maker, baseToken, baseAmount);
            IVault(vault).executeTransfer(maker, taker, quoteToken, quoteAmount);
        }
    }

    // ---- SST Queries ----
    function _findBestBid(uint256 minIdx) internal view returns (bool found, uint256 idx) {
        uint32 sstMinIdx = _mapTickIndexToSST(minIdx);
        (bool sstFound, uint32 sstIdx) = _findLastNonZero(bids.tree, sstMinIdx, uint32(MAX_TICK_INDEX + 1));
        if (sstFound) {
            idx = uint256(sstIdx);
        }
        return (sstFound, idx);
    }

    function _findBestAsk(uint256 maxIdx) internal view returns (bool found, uint256 idx) {
        uint32 sstMaxIdx = _mapTickIndexToSST(maxIdx);
        (bool sstFound, uint32 sstIdx) = _findFirstNonZero(asks.tree, 0, uint32(sstMaxIdx + 1));
        if (sstFound) {
            idx = uint256(sstIdx);
        }
        return (sstFound, idx);
    }

    // ---- Public Interface ----
    function placeLimitOrder(OrderStructs.LimitOrder calldata order) 
        external nonReentrant validPrice(order.price) returns (bytes32 orderHash, uint64 filledAmount) 
    {
        // NOTE: msg.sender is Router, not the user. Router has already validated the maker.
        require(order.baseToken == baseToken && order.quoteToken == quoteToken, "INVALID_TOKENS");
        require(order.baseAmount > 0, "ZERO_AMOUNT");
        require(!_isExpired(order.expiry), "EXPIRED");

        orderHash = _hashOrder(order);
        require(orderHashToId[orderHash] == 0, "DUPLICATE_ORDER");

        // Lock funds in vault
        if (order.isSellBase) {
            IVault(vault).lockBalance(order.maker, baseToken, order.baseAmount);
        } else {
            uint256 quoteNeeded256 = (uint256(order.baseAmount) * order.price) / 1e18;
            require(quoteNeeded256 > 0, "ZERO_QUOTE_NEEDED");
            require(quoteNeeded256 <= type(uint64).max, "QUOTE_AMOUNT_TOO_LARGE");
            uint64 quoteNeeded = uint64(quoteNeeded256);
            IVault(vault).lockBalance(order.maker, quoteToken, quoteNeeded);
        }

        // Try to match against existing orders
        filledAmount = _matchOrder(order);
        uint64 remainingAmount = order.baseAmount - filledAmount;

        // If there's remaining amount, add to book
        if (remainingAmount > 0) {
            OrderStructs.LimitOrder memory remainingOrder = order;
            remainingOrder.baseAmount = remainingAmount;

            uint256 idx = _tickIndex(order.price);
            uint64 orderId;
            
            if (order.isSellBase) {
                orderId = _enqueue(asks, idx, remainingOrder, orderHash);
                orderIsBid[orderId] = false;
            } else {
                orderId = _enqueue(bids, idx, remainingOrder, orderHash);
                orderIsBid[orderId] = true;
            }

            // Track order
            orderHashToId[orderHash] = orderId;
            orderTickIndex[orderId] = uint256(idx);
            userOrders[order.maker].push(orderHash);

            emit OrderPlaced(orderHash, order, orderId);
        }
        
        return (orderHash, filledAmount);
    }

    function cancelOrderByHash(bytes32 orderHash) external nonReentrant onlyMaker(orderHash) {
        uint64 orderId = orderHashToId[orderHash];
        bool isBid = orderIsBid[orderId];
        uint256 idx = orderTickIndex[orderId];

        // Remove from book
        OrderNode memory node = isBid ? 
            _removeOrder(bids, idx, orderId) : 
            _removeOrder(asks, idx, orderId);

        // Unlock funds
        _unlockFunds(node);

        // Clean up tracking
        _cleanupOrder(orderId, orderHash, node.maker);

        emit OrderCancelled(orderHash, node.maker, orderId);
    }

    function cancelOrder(OrderStructs.LimitOrder calldata order) external {
        bytes32 orderHash = _hashOrder(order);
        this.cancelOrderByHash(orderHash);
    }

    // ---- View Functions ----
    function getOrderInfo(bytes32 orderHash) external view returns (OrderStructs.OrderInfo memory info) {
        uint64 orderId = orderHashToId[orderHash];
        if (orderId == 0) {
            info.status = OrderStructs.OrderStatus.CANCELLED;
            return info;
        }

        bool isBid = orderIsBid[orderId];
        uint256 idx = orderTickIndex[orderId];
        
        OrderNode storage node = isBid ? 
            bids.levels[idx].orders[orderId] : 
            asks.levels[idx].orders[orderId];

        if (_isExpired(node.expiry)) {
            info.status = OrderStructs.OrderStatus.EXPIRED;
        } else {
            info.status = OrderStructs.OrderStatus.PENDING;
        }
        
        info.filledBase = 0; // TODO: Calculate properly
    }

    function getUserOrders(address user) external view returns (bytes32[] memory) {
        return userOrders[user];
    }

    function getPairInfo() external view returns (address, address, uint256) {
        return (baseToken, quoteToken, tickSize);
    }

    function getVault() external view returns (address) {
        return vault;
    }

    function getBestBid() external view returns (bool exists, uint256 price, uint64 totalBase) {
        uint256 idx;
        (exists, idx) = _findBestBid(0);
        if (exists) {
            price = idx * tickSize;
            totalBase = bids.levels[idx].totalBaseAmount;
        }
    }

    function getBestAsk() external view returns (bool exists, uint256 price, uint64 totalBase) {
        uint256 idx;
        (exists, idx) = _findBestAsk(MAX_TICK_INDEX);
        if (exists) {
            price = idx * tickSize;
            totalBase = asks.levels[idx].totalBaseAmount;
        }
    }

    function getPriceLevel(uint256 price) external view validPrice(price) returns (uint64 totalBase, uint64 orderCount) {
        uint256 idx = _tickIndex(price);
        LevelQueue storage bidLevel = bids.levels[idx];
        LevelQueue storage askLevel = asks.levels[idx];
        
        totalBase = bidLevel.totalBaseAmount + askLevel.totalBaseAmount;
        orderCount = bidLevel.length + askLevel.length;
    }

    // Debug Functions
    function getOrderBookState(uint256 price) external view returns (
        uint64 bidLength,
        uint64 bidTotalBase,
        uint64 askLength, 
        uint64 askTotalBase
    ) {
        uint256 idx = _tickIndex(price);
        LevelQueue storage bidLevel = bids.levels[idx];
        LevelQueue storage askLevel = asks.levels[idx];
        
        return (
            bidLevel.length,
            bidLevel.totalBaseAmount,
            askLevel.length,
            askLevel.totalBaseAmount
        );
    }

    function getSSTState(uint256 startPrice, uint256 endPrice) external view returns (
        uint64[] memory bidValues,
        uint64[] memory askValues
    ) {
        uint256 startIdx = _tickIndex(startPrice);
        uint256 endIdx = _tickIndex(endPrice);
        uint256 size = endIdx - startIdx + 1;
        
        bidValues = new uint64[](size);
        askValues = new uint64[](size);
        
        for(uint256 i = 0; i < size; i++) {
            uint32 sstIdx = _mapTickIndexToSST(startIdx + i);
            bidValues[i] = bids.tree.get(sstIdx);
            askValues[i] = asks.tree.get(sstIdx);
        }
    }

    function getOrderDetails(bytes32 orderHash) external view returns (
        bool exists,
        bool isBid,
        uint256 price,
        uint64 remainingAmount,
        address maker
    ) {
        uint64 orderId = orderHashToId[orderHash];
        if (orderId == 0) return (false, false, 0, 0, address(0));

        isBid = orderIsBid[orderId];
        uint256 idx = orderTickIndex[orderId];
        OrderNode storage node = isBid ? 
            bids.levels[idx].orders[orderId] : 
            asks.levels[idx].orders[orderId];

        return (
            true,
            isBid,
            node.price,
            node.remainingBase,
            node.maker
        );
    }
}