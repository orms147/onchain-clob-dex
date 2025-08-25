// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./interfaces/IClobPair.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IRouter.sol";
import "./libraries/SegmentedSegmentTree.sol";
import "./libraries/OrderStructs.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract ClobPair is IClobPair, ReentrancyGuard {
    using SegmentedSegmentTree for SegmentedSegmentTree.Core;
    using Math for uint256;

    address public immutable baseToken;
    address public immutable quoteToken;
    uint256 public immutable tickSize;
    address public immutable vault;
    address public immutable router;

    uint32 private constant MAX_TICK_INDEX = 32767;

    struct OrderNode {
        uint64  prev;
        uint64  next;
        address maker;
        uint64  remainingBase;
        uint256 price;
        bool    isSellBase;
        uint256 nonce;
        uint256 expiry;
        bytes32 orderHash;
    }

    struct LevelQueue {
        uint64 head;
        uint64 tail;
        uint64 length;
        uint64 totalBaseAmount;
        mapping(uint64 => OrderNode) orders;
    }

    struct BookSide {
        SegmentedSegmentTree.Core tree;
        mapping(uint256 => LevelQueue) levels;
    }

    BookSide private bids;
    BookSide private asks;

    uint64 private _nextOrderId;

    mapping(bytes32 => uint64) public orderHashToId;
    mapping(uint64 => bool) public orderIsBid;
    mapping(uint64 => uint256) public orderTickIndex;
    mapping(address => bytes32[]) private userOrders;
    mapping(address => mapping(bytes32 => uint256)) private userOrderIndex;

    mapping(bytes32 => uint64) private orderInitialBase;
    mapping(bytes32 => bool) private orderHasFinal;
    mapping(bytes32 => OrderStructs.OrderStatus) private orderFinalStatus;
    mapping(bytes32 => uint256) private orderFinalFilledBase;
    mapping(bytes32 => uint256) private orderCreatedAt;

    event OrderExpired(bytes32 indexed orderHash, address indexed maker, uint64 orderId);

    constructor(address _baseToken, address _quoteToken, uint256 _tickSize, address _vault, address _router) {
        require(_baseToken != address(0) && _quoteToken != address(0), "ZERO_ADDRESS");
        require(_baseToken != _quoteToken, "IDENTICAL_TOKENS");
        require(_baseToken < _quoteToken, "TOKENS_NOT_SORTED");
        require(_tickSize > 0, "ZERO_TICK_SIZE");
        require(_vault != address(0), "ZERO_VAULT");
        require(_router != address(0), "ZERO_ROUTER");

        baseToken = _baseToken;
        quoteToken = _quoteToken;
        tickSize = _tickSize;
        vault = _vault;
        router = _router;
    }

    modifier validPrice(uint256 price) {
        require(price > 0, "INVALID_PRICE");
        require((price * OrderStructs.PRICE_SCALE) % (tickSize * OrderStructs.PRICE_SCALE) == 0, 
                "INVALID_PRICE_TICK");
        uint256 idx = price / tickSize;
        require(idx <= MAX_TICK_INDEX && idx > 0, "PRICE_OUT_OF_RANGE");
        _;
    }

    modifier onlyMaker(bytes32 orderHash) {
        OrderNode storage node = _getOrderNode(orderHash);
        require(node.maker == msg.sender, "NOT_MAKER");
        _;
    }

    modifier onlyRouter() {
        require(msg.sender == router, "NOT_ROUTER");
        _;
    }

    function _hashOrder(OrderStructs.LimitOrder calldata order) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            OrderStructs.LIMIT_ORDER_TYPEHASH,
            order.maker,
            order.baseToken,
            order.quoteToken,
            order.clobPair,
            order.baseAmount,
            order.price,
            order.isSellBase,
            order.expiry,
            order.nonce
        ));
        bytes32 ds = IRouter(router).domainSeparator();
        return keccak256(abi.encodePacked("\x19\x01", ds, structHash));
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
        side.tree.update(uint32(idx), totalBaseAmount);
    }

    function _removeFromUserOrders(address user, bytes32 orderHash) internal {
        bytes32[] storage arr = userOrders[user];
        uint256 index = userOrderIndex[user][orderHash];
        require(index < arr.length && arr[index] == orderHash, "INVALID_INDEX");

        if (index < arr.length - 1) {
            arr[index] = arr[arr.length - 1];
            userOrderIndex[user][arr[index]] = index;
        }
        arr.pop();
        delete userOrderIndex[user][orderHash];
    }

    function _cleanupOrder(uint64 orderId, bytes32 orderHash, address maker) internal {
        delete orderHashToId[orderHash];
        delete orderIsBid[orderId];
        delete orderTickIndex[orderId];
        delete orderCreatedAt[orderHash];
        _removeFromUserOrders(maker, orderHash);
    }

    function _unlockFunds(OrderNode memory node) internal {
        try IVault(vault).unlockBalance(node.maker, node.isSellBase ? baseToken : quoteToken,
            node.isSellBase ? node.remainingBase : (uint256(node.remainingBase) * node.price).mulDiv(1, OrderStructs.PRICE_SCALE, Math.Rounding.Ceil)) {
        } catch {
            revert("Vault paused or failed");
        }
    }

    function _enqueue(BookSide storage side, uint256 idx, OrderStructs.LimitOrder memory order, bytes32 orderHash)
        internal
        returns (uint64 orderId)
    {
        LevelQueue storage q = side.levels[idx];
        orderId = ++_nextOrderId;
        OrderNode storage node = q.orders[orderId];

        node.maker = order.maker;
        node.remainingBase = order.baseAmount;
        node.price = order.price;
        node.isSellBase = order.isSellBase;
        node.nonce = order.nonce;
        node.expiry = order.expiry;
        node.orderHash = orderHash;

        orderInitialBase[orderHash] = order.baseAmount;
        orderCreatedAt[orderHash] = block.timestamp;

        if (q.tail == 0) {
            q.head = orderId;
            q.tail = orderId;
        } else {
            node.prev = q.tail;
            q.orders[q.tail].next = orderId;
            q.tail = orderId;
        }

        q.length += 1;
        q.totalBaseAmount += order.baseAmount;
        _updateSST(side, idx, q.totalBaseAmount);

        userOrders[order.maker].push(orderHash);
        userOrderIndex[order.maker][orderHash] = userOrders[order.maker].length - 1;
    }

    function _removeOrder(BookSide storage side, uint256 idx, uint64 orderId)
        internal
        returns (OrderNode memory node)
    {
        LevelQueue storage q = side.levels[idx];
        OrderNode storage ord = q.orders[orderId];
        require(ord.maker != address(0), "ORDER_NOT_FOUND");

        node = ord;
        uint64 prev = ord.prev;
        uint64 next = ord.next;

        if (prev == 0) q.head = next; else q.orders[prev].next = next;
        if (next == 0) q.tail = prev; else q.orders[next].prev = prev;

        q.length -= 1;
        q.totalBaseAmount -= node.remainingBase;
        delete q.orders[orderId];
        _updateSST(side, idx, q.totalBaseAmount);
    }

    function _partialFill(BookSide storage side, uint256 idx, uint64 orderId, uint64 fillAmount) internal {
        LevelQueue storage q = side.levels[idx];
        OrderNode storage ord = q.orders[orderId];
        require(ord.remainingBase >= fillAmount, "INSUFFICIENT_REMAINING");
        ord.remainingBase -= fillAmount;
        q.totalBaseAmount -= fillAmount;
        _updateSST(side, idx, q.totalBaseAmount);
    }

    function _findFirstNonZero(SegmentedSegmentTree.Core storage tree, uint32 left, uint32 right)
        internal
        view
        returns (bool found, uint32 idx)
    {
        require(left < right, "INVALID_RANGE");
        if (tree.query(left, right) == 0) return (false, 0);

        uint32 lo = left;
        uint32 hi = right - 1;
        while (lo <= hi) {
            uint32 mid = (lo + hi) / 2;
            if (tree.get(mid) > 0) {
                if (mid == left || tree.get(mid - 1) == 0) return (true, mid);
                hi = mid - 1;
            } else {
                lo = mid + 1;
            }
        }
        return (false, 0);
    }

    function _findLastNonZero(SegmentedSegmentTree.Core storage tree, uint32 left, uint32 right)
        internal
        view
        returns (bool found, uint32 idx)
    {
        require(left < right, "INVALID_RANGE");
        if (tree.query(left, right) == 0) return (false, 0);

        uint32 lo = left;
        uint32 hi = right - 1;
        while (lo <= hi) {
            uint32 mid = (lo + hi) / 2;
            if (tree.get(mid) > 0) {
                if (mid == right - 1 || tree.get(mid + 1) == 0) return (true, mid);
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return (false, 0);
    }

    function _findBestBid(uint256 minIdx) internal view returns (bool found, uint256 idx) {
        (bool ok, uint32 i) = _findLastNonZero(bids.tree, uint32(minIdx), uint32(MAX_TICK_INDEX + 1));
        return (ok, uint256(i));
    }

    function _findBestAsk(uint256 maxIdx) internal view returns (bool found, uint256 idx) {
        (bool ok, uint32 i) = _findFirstNonZero(asks.tree, 0, uint32(maxIdx + 1));
        return (ok, uint256(i));
    }

    function _executeTrade(address maker, address taker, uint64 baseAmount, uint256 price, bool takerIsBuying)
        internal
        returns (uint256 quoteUsed)
    {
        require(baseAmount > 0, "ZERO_AMOUNT");
        uint256 quoteAmount = (uint256(baseAmount) * price).mulDiv(1, OrderStructs.PRICE_SCALE, Math.Rounding.Floor);
        require(quoteAmount > 0, "ZERO_QUOTE");

        try IVault(vault).executeTransfer(takerIsBuying ? maker : taker, takerIsBuying ? taker : maker, baseToken, baseAmount) {
            try IVault(vault).executeTransfer(takerIsBuying ? taker : maker, takerIsBuying ? maker : taker, quoteToken, quoteAmount) {
                return quoteAmount;
            } catch {
                revert("Vault paused or transfer failed");
            }
        } catch {
            revert("Vault paused or transfer failed");
        }
    }

    function _fillAtLevel(BookSide storage side, uint256 idx, address taker, uint64 remaining, bool takerIsBuying)
        internal
        returns (uint64 stillRemaining, uint256 takerQuoteSpent)
    {
        LevelQueue storage q = side.levels[idx];
        uint64 orderId = q.head;
        stillRemaining = remaining;
        takerQuoteSpent = 0;

        while (orderId != 0 && stillRemaining > 0) {
            OrderNode storage m = q.orders[orderId];
            uint64 nextId = m.next; // Store nextId before any modifications

            if (m.maker == taker) {
                orderId = nextId;
                continue;
            }

            if (_isExpired(m.expiry)) {
                OrderNode memory expired = _removeOrder(side, idx, orderId);
                _unlockFunds(expired);
                
                uint64 initBase = orderInitialBase[expired.orderHash];
                uint256 filled = initBase > expired.remainingBase ? (initBase - expired.remainingBase) : 0;
                
                orderFinalStatus[expired.orderHash] = OrderStructs.OrderStatus.EXPIRED;
                orderFinalFilledBase[expired.orderHash] = filled;
                orderHasFinal[expired.orderHash] = true;
                delete orderInitialBase[expired.orderHash];
                
                _cleanupOrder(orderId, expired.orderHash, expired.maker);
                emit OrderExpired(expired.orderHash, expired.maker, orderId);
                orderId = nextId;
                continue;
            }

            uint64 fillAmount = m.remainingBase > stillRemaining ? stillRemaining : m.remainingBase;
            uint256 quoteUsed = _executeTrade(m.maker, taker, fillAmount, m.price, takerIsBuying);
            
            if (takerIsBuying) {
                takerQuoteSpent += quoteUsed;
            }

            bool isFinal = (m.remainingBase == fillAmount);
            emit OrderFilled(
                m.orderHash,
                m.maker,
                taker,
                uint128(fillAmount),
                uint128(quoteUsed),
                m.price,
                isFinal
            );

            stillRemaining -= fillAmount;

            if (isFinal) {
                _removeOrder(side, idx, orderId);
                
                uint64 initBase = orderInitialBase[m.orderHash];
                orderFinalStatus[m.orderHash] = OrderStructs.OrderStatus.FILLED;
                orderFinalFilledBase[m.orderHash] = initBase;
                orderHasFinal[m.orderHash] = true;
                delete orderInitialBase[m.orderHash];
                
                _cleanupOrder(orderId, m.orderHash, m.maker);
                orderId = nextId;
            } else {
                _partialFill(side, idx, orderId, fillAmount);
                orderId = nextId; // Use stored nextId
            }
        }
    }

    function _matchOrder(OrderStructs.LimitOrder calldata order)
        internal
        returns (uint64 totalBaseFilled, uint256 takerQuoteSpent)
    {
        uint256 orderIdx = order.price / tickSize;
        uint64 remaining = order.baseAmount;
        if (order.isSellBase) {
            while (remaining > 0) {
                (bool found, uint256 idx) = _findBestBid(orderIdx);
                if (!found || idx > orderIdx) break;
                (uint64 still, uint256 spent) = _fillAtLevel(bids, idx, order.maker, remaining, false);
                takerQuoteSpent += spent;
                totalBaseFilled += (remaining - still);
                remaining = still;
            }
        } else {
            while (remaining > 0) {
                (bool found, uint256 idx) = _findBestAsk(orderIdx);
                if (!found || idx < orderIdx) break;
                (uint64 still, uint256 spent) = _fillAtLevel(asks, idx, order.maker, remaining, true);
                takerQuoteSpent += spent;
                totalBaseFilled += (remaining - still);
                remaining = still;
            }
        }
    }

    function placeLimitOrder(OrderStructs.LimitOrder calldata order)
        external
        override
        nonReentrant
        onlyRouter
        validPrice(order.price)
        returns (bytes32 orderHash, uint64 filledAmount)
    {
        OrderStructs.validateOrder(order);
        require(order.baseToken == baseToken && order.quoteToken == quoteToken, "INVALID_TOKENS");
        require(order.baseAmount > 0, "ZERO_AMOUNT");
        require(!_isExpired(order.expiry), "EXPIRED");

        orderHash = _hashOrder(order);
        require(orderHashToId[orderHash] == 0, "DUPLICATE_ORDER");

        if (order.isSellBase) {
            IVault(vault).lockBalance(order.maker, baseToken, order.baseAmount);
        } else {
            uint256 quoteNeeded = (uint256(order.baseAmount) * order.price).mulDiv(1, OrderStructs.PRICE_SCALE, Math.Rounding.Ceil);
            require(quoteNeeded > 0, "ZERO_QUOTE_NEEDED");
            IVault(vault).lockBalance(order.maker, quoteToken, quoteNeeded);
        }

        uint256 buyerSpent;
        (filledAmount, buyerSpent) = _matchOrder(order);
        uint64 remainingAmount = order.baseAmount - filledAmount;

        if (remainingAmount > 0) {
            uint256 idx = order.price / tickSize;
            uint64 orderId = order.isSellBase ? _enqueue(asks, idx, order, orderHash) : _enqueue(bids, idx, order, orderHash);
            orderIsBid[orderId] = !order.isSellBase;
            orderHashToId[orderHash] = orderId;
            orderTickIndex[orderId] = idx;

            emit OrderPlaced(orderHash, order, orderId);
        } else if (!order.isSellBase) {
            uint256 locked = (uint256(order.baseAmount) * order.price).mulDiv(1, OrderStructs.PRICE_SCALE, Math.Rounding.Ceil);
            if (buyerSpent < locked) {
                IVault(vault).unlockBalance(order.maker, quoteToken, locked - buyerSpent);
            }
        }

        return (orderHash, filledAmount);
    }

    function cancelOrderByHash(bytes32 orderHash)
        external
        override
        nonReentrant
        onlyMaker(orderHash)
    {
        uint64 orderId = orderHashToId[orderHash];
        bool isBid = orderIsBid[orderId];
        uint256 idx = orderTickIndex[orderId];

        OrderNode memory node = isBid ? _removeOrder(bids, idx, orderId) : _removeOrder(asks, idx, orderId);
        _unlockFunds(node);

        uint64 initBase = orderInitialBase[orderHash];
        uint256 filled = initBase > node.remainingBase ? (initBase - node.remainingBase) : 0;
        orderFinalStatus[orderHash] = _isExpired(node.expiry) ? OrderStructs.OrderStatus.EXPIRED : OrderStructs.OrderStatus.CANCELLED;
        orderFinalFilledBase[orderHash] = filled;
        orderHasFinal[orderHash] = true;
        delete orderInitialBase[orderHash];

        _cleanupOrder(orderId, orderHash, node.maker);
        emit OrderCancelled(orderHash, node.maker, orderId);
    }

    function cancelOrder(OrderStructs.LimitOrder calldata order)
        external
        override
        onlyRouter
        nonReentrant
    {
        bytes32 orderHash = _hashOrder(order);
        uint64 orderId = orderHashToId[orderHash];
        require(orderId != 0, "ORDER_NOT_FOUND");

        bool isBid = orderIsBid[orderId];
        uint256 idx = orderTickIndex[orderId];

        OrderNode memory node = isBid ? _removeOrder(bids, idx, orderId) : _removeOrder(asks, idx, orderId);
        require(node.maker == order.maker, "MAKER_MISMATCH");

        _unlockFunds(node);

        uint64 initBase = orderInitialBase[orderHash];
        uint256 filled = initBase > node.remainingBase ? (initBase - node.remainingBase) : 0;
        orderFinalStatus[orderHash] = _isExpired(node.expiry) ? OrderStructs.OrderStatus.EXPIRED : OrderStructs.OrderStatus.CANCELLED;
        orderFinalFilledBase[orderHash] = filled;
        orderHasFinal[orderHash] = true;
        delete orderInitialBase[orderHash];

        _cleanupOrder(orderId, orderHash, node.maker);
        emit OrderCancelled(orderHash, node.maker, orderId);
    }

    function cancelOrderByHashFromRouter(bytes32 orderHash, address maker)
        external
        override
        onlyRouter
        nonReentrant
    {
        uint64 orderId = orderHashToId[orderHash];
        require(orderId != 0, "ORDER_NOT_FOUND");

        bool isBid = orderIsBid[orderId];
        uint256 idx = orderTickIndex[orderId];

        OrderNode memory node = isBid ? _removeOrder(bids, idx, orderId) : _removeOrder(asks, idx, orderId);
        require(node.maker == maker, "MAKER_MISMATCH");

        _unlockFunds(node);

        uint64 initBase = orderInitialBase[orderHash];
        uint256 filled = initBase > node.remainingBase ? (initBase - node.remainingBase) : 0;
        orderFinalStatus[orderHash] = _isExpired(node.expiry) ? OrderStructs.OrderStatus.EXPIRED : OrderStructs.OrderStatus.CANCELLED;
        orderFinalFilledBase[orderHash] = filled;
        orderHasFinal[orderHash] = true;
        delete orderInitialBase[orderHash];

        _cleanupOrder(orderId, orderHash, node.maker);
        emit OrderCancelled(orderHash, node.maker, orderId);
    }

    function cleanupExpiredOrders(uint256 price, uint64 maxOrders) external nonReentrant returns (uint64 cleaned) {
        uint256 idx = price / tickSize;
        require(idx <= MAX_TICK_INDEX, "INVALID_PRICE");
        
        LevelQueue storage bidQueue = bids.levels[idx];
        LevelQueue storage askQueue = asks.levels[idx];
        
        cleaned = _cleanupExpiredInQueue(bidQueue, idx, true, maxOrders);
        cleaned += _cleanupExpiredInQueue(askQueue, idx, false, maxOrders - cleaned);
    }

    function _cleanupExpiredInQueue(LevelQueue storage q, uint256 idx, bool isBid, uint64 maxOrders) 
        internal 
        returns (uint64 cleaned) 
    {
        uint64 orderId = q.head;
        cleaned = 0;
        
        while (orderId != 0 && cleaned < maxOrders) {
            OrderNode storage node = q.orders[orderId];
            uint64 nextId = node.next;
            
            if (_isExpired(node.expiry)) {
                OrderNode memory expired = _removeOrder(isBid ? bids : asks, idx, orderId);
                _unlockFunds(expired);
                
                uint64 initBase = orderInitialBase[expired.orderHash];
                uint256 filled = initBase > expired.remainingBase ? (initBase - expired.remainingBase) : 0;
                
                orderFinalStatus[expired.orderHash] = OrderStructs.OrderStatus.EXPIRED;
                orderFinalFilledBase[expired.orderHash] = filled;
                orderHasFinal[expired.orderHash] = true;
                delete orderInitialBase[expired.orderHash];
                
                _cleanupOrder(orderId, expired.orderHash, expired.maker);
                cleaned++;
                
                emit OrderExpired(expired.orderHash, expired.maker, orderId);
            }
            
            orderId = nextId;
        }
    }

    function getOrderInfo(bytes32 orderHash) external view override returns (OrderStructs.OrderInfo memory info) {
        info.orderHash = orderHash;

        uint64 orderId = orderHashToId[orderHash];
        if (orderId == 0) {
            if (orderHasFinal[orderHash]) {
                info.status = orderFinalStatus[orderHash];
                info.filledBase = orderFinalFilledBase[orderHash];
            } else {
                info.status = OrderStructs.OrderStatus.CANCELLED;
                info.filledBase = 0;
            }
            info.createdAt = orderCreatedAt[orderHash];
            return info;
        }

        bool isBid = orderIsBid[orderId];
        uint256 idx = orderTickIndex[orderId];
        OrderNode storage node = isBid ? bids.levels[idx].orders[orderId] : asks.levels[idx].orders[orderId];

        info.createdAt = orderCreatedAt[orderHash];

        if (_isExpired(node.expiry)) {
            info.status = OrderStructs.OrderStatus.EXPIRED;
            uint64 initBase = orderInitialBase[node.orderHash];
            info.filledBase = initBase > node.remainingBase ? (initBase - node.remainingBase) : 0;
        } else {
            uint64 initBase = orderInitialBase[node.orderHash];
            uint64 filled = initBase > node.remainingBase ? (initBase - node.remainingBase) : 0;
            
            if (filled == 0) {
                info.status = OrderStructs.OrderStatus.PENDING;
            } else if (filled < initBase) {
                info.status = OrderStructs.OrderStatus.PARTIALLY_FILLED;
            } else {
                info.status = OrderStructs.OrderStatus.FILLED;
            }
            
            info.filledBase = filled;
        }
    }

    function getUserOrders(address user) external view override returns (bytes32[] memory) {
        return userOrders[user];
    }

    function getPairInfo() external view override returns (address, address, uint256) {
        return (baseToken, quoteToken, tickSize);
    }

    function getVault() external view override returns (address) {
        return vault;
    }

    function getBestBid() external view override returns (bool exists, uint256 price, uint64 totalBase) {
        (exists, ) = _findBestBid(0);
        if (!exists) return (false, 0, 0);
        ( , uint256 idx) = _findBestBid(0);
        price = idx * tickSize;
        totalBase = bids.levels[idx].totalBaseAmount;
    }

    function getBestAsk() external view override returns (bool exists, uint256 price, uint64 totalBase) {
        (exists, ) = _findBestAsk(MAX_TICK_INDEX);
        if (!exists) return (false, 0, 0);
        ( , uint256 idx) = _findBestAsk(MAX_TICK_INDEX);
        price = idx * tickSize;
        totalBase = asks.levels[idx].totalBaseAmount;
    }

    function getPriceLevel(uint256 price)
        external
        view
        override
        validPrice(price)
        returns (uint64 totalBase, uint64 orderCount)
    {
        uint256 idx = price / tickSize;
        LevelQueue storage b = bids.levels[idx];
        LevelQueue storage a = asks.levels[idx];
        totalBase = b.totalBaseAmount + a.totalBaseAmount;
        orderCount = b.length + a.length;
    }

    function getOrderDetails(bytes32 orderHash)
        external
        view
        override
        returns (bool exists, bool isBid, uint256 price, uint64 remainingAmount, address maker)
    {
        uint64 orderId = orderHashToId[orderHash];
        if (orderId == 0) return (false, false, 0, 0, address(0));

        isBid = orderIsBid[orderId];
        uint256 idx = orderTickIndex[orderId];
        OrderNode storage node = isBid ? bids.levels[idx].orders[orderId] : asks.levels[idx].orders[orderId];

        return (true, isBid, node.price, node.remainingBase, node.maker);
    }
}