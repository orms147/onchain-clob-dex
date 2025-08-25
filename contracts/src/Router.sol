// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import "./interfaces/IRouter.sol";
import "./interfaces/IClobFactory.sol";
import "./interfaces/IClobPair.sol";
import "./libraries/OrderStructs.sol";

contract Router is IRouter, EIP712, ReentrancyGuard {
    using ECDSA for bytes32;

    constructor(address _factory) EIP712("ClobRouter", "1") {
        require(_factory != address(0), "Router: invalid factory");
        factory = _factory;
    }

    address public immutable factory;
    mapping(address => uint256) public userNonces;
    mapping(bytes32 => address) public orderToMaker;
    mapping(bytes32 => address) public orderToPair;

    event OrderPlaced(bytes32 indexed orderHash, address indexed maker, address indexed clobPair, OrderStructs.LimitOrder order);
    event OrderCancelled(bytes32 indexed orderHash, address indexed maker, address indexed clobPair);
    event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed clobPair, uint64 filledAmount);
    event BatchOrdersPlaced(address indexed maker, uint256 orderCount);
    event BatchOrdersCancelled(address indexed maker, uint256 orderCount);
    event BatchFailed(uint256 index, string reason);

    modifier validOrder(OrderStructs.LimitOrder calldata order) {
        OrderStructs.validateOrder(order);
        _;
    }

    function _hashLimitOrder(OrderStructs.LimitOrder calldata order) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
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
            )
        );
        return _hashTypedDataV4(structHash);
    }

    function _hashCancelOrder(bytes32 orderHash, uint256 nonce) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(OrderStructs.CANCEL_ORDER_TYPEHASH, orderHash, nonce));
        return _hashTypedDataV4(structHash);
    }

    function _verifySignature(bytes32 digest, bytes calldata signature, address signer) internal pure {
        address recovered = digest.recover(signature);
        require(recovered == signer, "Router: invalid signature");
    }

    function _findClobPairForPrice(address baseToken, address quoteToken, uint256 price)
        internal
        view
        returns (address clobPair)
    {
        address[] memory allPairs = IClobFactory(factory).getAllPairs();
        address best = address(0);
        uint256 bestTick = 0;

        for (uint256 i = 0; i < allPairs.length; i++) {
            (address pBase, address pQuote, uint256 tick) = IClobPair(allPairs[i]).getPairInfo();
            if (pBase != baseToken || pQuote != quoteToken) continue;
            if (price % tick != 0) continue;

            try IClobPair(allPairs[i]).getPriceLevel(price) returns (uint64, uint64) {
                if (tick > bestTick) {
                    bestTick = tick;
                    best = allPairs[i];
                }
            } catch {
                // Skip invalid pair
            }
        }

        require(best != address(0), "Router: pair not found");
        return best;
    }

    function placeLimitOrder(
        OrderStructs.LimitOrder calldata order,
        bytes calldata signature
    ) external override nonReentrant validOrder(order) returns (bytes32 orderHash) {
        if (order.maker != msg.sender) {
            require(signature.length > 0, "Router: signature required");
            _verifySignature(_hashLimitOrder(order), signature, order.maker);
        }

        require(order.nonce >= userNonces[order.maker], "Router: invalid nonce");
        userNonces[order.maker] = order.nonce + 1;

        address clobPair = order.clobPair != address(0) ? order.clobPair : _findClobPairForPrice(order.baseToken, order.quoteToken, order.price);
        (address pairBaseToken, address pairQuoteToken, ) = IClobPair(clobPair).getPairInfo();
        require(pairBaseToken == order.baseToken && pairQuoteToken == order.quoteToken, "Router: invalid pair");

        bytes32 orderHash;
        uint64 filledAmount;
        (orderHash, filledAmount) = IClobPair(clobPair).placeLimitOrder(order);

        if (filledAmount < order.baseAmount) {
            orderToMaker[orderHash] = order.maker;
            orderToPair[orderHash] = clobPair;
            emit OrderPlaced(orderHash, order.maker, clobPair, order);
        } else {
            emit OrderFilled(orderHash, order.maker, clobPair, filledAmount);
        }

        return orderHash;
    }

    function cancelOrder(
        OrderStructs.LimitOrder calldata order,
        bytes calldata signature
    ) external override nonReentrant {
        bytes32 orderHash = _hashLimitOrder(order);

        if (order.maker != msg.sender) {
            require(signature.length > 0, "Router: signature required");
            _verifySignature(_hashCancelOrder(orderHash, order.nonce), signature, order.maker);
        }

        address storedMaker = orderToMaker[orderHash];
        require(storedMaker != address(0), "Router: order not found");
        require(storedMaker == order.maker, "Router: unauthorized");

        address clobPair = orderToPair[orderHash];
        require(clobPair != address(0), "Router: pair not found");

        OrderStructs.OrderInfo memory info = IClobPair(clobPair).getOrderInfo(orderHash);
        require(
            info.status == OrderStructs.OrderStatus.PENDING || 
            info.status == OrderStructs.OrderStatus.PARTIALLY_FILLED,
            "Router: order not active"
        );

        IClobPair(clobPair).cancelOrder(order);

        delete orderToMaker[orderHash];
        delete orderToPair[orderHash];
        emit OrderCancelled(orderHash, order.maker, clobPair);
    }

    function cancelOrderByHash(bytes32 orderHash) external override nonReentrant {
        address maker = orderToMaker[orderHash];
        require(maker != address(0), "Router: order not found");
        require(maker == msg.sender, "Router: unauthorized");

        address clobPair = orderToPair[orderHash];
        require(clobPair != address(0), "Router: pair not found");

        OrderStructs.OrderInfo memory info = IClobPair(clobPair).getOrderInfo(orderHash);
        require(
            info.status == OrderStructs.OrderStatus.PENDING || 
            info.status == OrderStructs.OrderStatus.PARTIALLY_FILLED,
            "Router: order not active"
        );

        IClobPair(clobPair).cancelOrderByHashFromRouter(orderHash, maker);

        delete orderToMaker[orderHash];
        delete orderToPair[orderHash];
        emit OrderCancelled(orderHash, maker, clobPair);
    }

    function batchPlaceLimitOrders(
        OrderStructs.LimitOrder[] calldata orders,
        bytes[] calldata signatures
    ) external override nonReentrant {
        require(orders.length == signatures.length, "Router: length mismatch");
        require(orders.length > 0, "Router: empty");

        uint256 successCount = 0;
        for (uint256 i = 0; i < orders.length; i++) {
            try this.placeLimitOrder(orders[i], signatures[i]) {
                successCount++;
            } catch Error(string memory reason) {
                emit BatchFailed(i, reason);
            }
        }
        emit BatchOrdersPlaced(msg.sender, successCount);
    }

    function batchCancelOrders(
        OrderStructs.LimitOrder[] calldata orders,
        bytes[] calldata signatures
    ) external override nonReentrant {
        require(orders.length == signatures.length, "Router: length mismatch");
        require(orders.length > 0, "Router: empty");

        uint256 successCount = 0;
        for (uint256 i = 0; i < orders.length; i++) {
            try this.cancelOrder(orders[i], signatures[i]) {
                successCount++;
            } catch Error(string memory reason) {
                emit BatchFailed(i, reason);
            }
        }
        emit BatchOrdersCancelled(msg.sender, successCount);
    }

    function cleanupExpiredOrders(
        address clobPair, 
        uint256 price, 
        uint64 maxOrders
    ) external nonReentrant returns (uint64 cleaned) {
        require(clobPair != address(0), "Router: invalid pair");
        cleaned = IClobPair(clobPair).cleanupExpiredOrders(price, maxOrders);
    }

    function getFactory() external view override returns (address) {
        return factory;
    }

    function domainSeparator() external view override returns (bytes32) {
        return _domainSeparatorV4();
    }

    function hashOrder(OrderStructs.LimitOrder calldata order) external view override returns (bytes32) {
        return _hashLimitOrder(order);
    }

    function getUserNonce(address user) external view returns (uint256) {
        return userNonces[user];
    }

    function getOrderMaker(bytes32 orderHash) external view returns (address) {
        return orderToMaker[orderHash];
    }

    function orderExists(bytes32 orderHash) external view returns (bool) {
        return orderToMaker[orderHash] != address(0);
    }
}