// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./interfaces/IRouter.sol";
import "./interfaces/IClobFactory.sol";
import "./interfaces/IClobPair.sol";
import "./libraries/OrderStructs.sol";

/**
 * @title Router
 * @notice Main entry point for users to interact with the CLOB DEX
 * @dev Handles EIP-712 signature validation and routes orders to appropriate ClobPair contracts
 */
contract Router is IRouter, EIP712, ReentrancyGuard {
    using ECDSA for bytes32;

    // ---- Constants ----
    bytes32 private constant LIMIT_ORDER_TYPEHASH = keccak256(
        "LimitOrder(address maker,address baseToken,address quoteToken,uint64 baseAmount,uint256 price,bool isSellBase,uint256 expiry,uint256 nonce)"
    );

    bytes32 private constant CANCEL_ORDER_TYPEHASH = keccak256(
        "CancelOrder(bytes32 orderHash,uint256 nonce)"
    );

    // ---- State Variables ----
    address public immutable factory;
    
    // Track user nonces for replay protection
    mapping(address => uint256) public userNonces;
    
    // Store order hash to maker mapping for cancellation
    mapping(bytes32 => address) public orderToMaker;

    // ---- Events ----
    event OrderPlaced(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed clobPair,
        OrderStructs.LimitOrder order
    );

    event OrderCancelled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed clobPair
    );

    event BatchOrdersPlaced(
        address indexed maker,
        uint256 orderCount
    );

    event BatchOrdersCancelled(
        address indexed maker,
        uint256 orderCount
    );

    // ---- Constructor ----
    constructor(address _factory) EIP712("ClobRouter", "1") {
        require(_factory != address(0), "Router: invalid factory");
        factory = _factory;
    }

    // ---- Modifiers ----
    modifier validOrder(OrderStructs.LimitOrder calldata order) {
        require(order.maker != address(0), "Router: invalid maker");
        require(order.baseToken != address(0) && order.quoteToken != address(0), "Router: invalid tokens");
        require(order.baseToken != order.quoteToken, "Router: identical tokens");
        require(order.baseAmount > 0, "Router: zero amount");
        require(order.price > 0, "Router: zero price");
        require(order.expiry == 0 || order.expiry > block.timestamp, "Router: expired order");
        _;
    }

    // ---- Internal Functions ----
    function _hashLimitOrder(OrderStructs.LimitOrder calldata order) internal view returns (bytes32) {
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

    function _hashCancelOrder(bytes32 orderHash, uint256 nonce) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            CANCEL_ORDER_TYPEHASH,
            orderHash,
            nonce
        )));
    }

    function _verifySignature(bytes32 hash, bytes calldata signature, address signer) internal pure {
        address recoveredSigner = hash.recover(signature);
        require(recoveredSigner == signer, "Router: invalid signature");
    }

    function _getClobPair(address baseToken, address quoteToken) internal view returns (address) {
        // Get all pairs and find the one with matching tokens
        // We need to check both directions since tokens are canonicalized in factory
        address[] memory allPairs = IClobFactory(factory).getAllPairs();
        
        for (uint256 i = 0; i < allPairs.length; i++) {
            address pair = allPairs[i];
            (address pairBase, address pairQuote,) = IClobPair(pair).getPairInfo();
            
            if ((pairBase == baseToken && pairQuote == quoteToken) ||
                (pairBase == quoteToken && pairQuote == baseToken)) {
                return pair;
            }
        }
        
        revert("Router: pair not found");
    }

    function _findClobPairWithTickSize(address baseToken, address quoteToken, uint256 price) 
        internal 
        view 
        returns (address clobPair) 
    {
        // Try common tick sizes first
        uint256[] memory commonTickSizes = new uint256[](5);
        commonTickSizes[0] = 1e12; // 0.000001 for high precision
        commonTickSizes[1] = 1e15; // 0.001 
        commonTickSizes[2] = 1e16; // 0.01
        commonTickSizes[3] = 1e17; // 0.1
        commonTickSizes[4] = 1e18; // 1.0
        
        for (uint256 i = 0; i < commonTickSizes.length; i++) {
            if (price % commonTickSizes[i] == 0) {
                clobPair = IClobFactory(factory).getClobPair(baseToken, quoteToken, commonTickSizes[i]);
                if (clobPair != address(0)) {
                    return clobPair;
                }
            }
        }
        
        revert("Router: no compatible pair found for price");
    }

    // ---- Public Functions ----
    
    /**
     * @notice Place a limit order with signature validation
     */
    function placeLimitOrder(
        OrderStructs.LimitOrder calldata order,
        bytes calldata signature
    ) external override nonReentrant validOrder(order) returns (bytes32 orderHash) {
        orderHash = _hashLimitOrder(order);
        
        // Verify the maker is the message sender or signature is valid
        if (order.maker != msg.sender) {
            require(signature.length > 0, "Router: signature required");
            _verifySignature(orderHash, signature, order.maker);
        }
        // If maker == msg.sender, no signature verification needed

        // Verify nonce
        require(order.nonce >= userNonces[order.maker], "Router: invalid nonce");
        userNonces[order.maker] = order.nonce + 1;

        // Find the appropriate ClobPair
        address clobPair = _findClobPairWithTickSize(order.baseToken, order.quoteToken, order.price);

        // Store order hash to maker mapping for later cancellation
        orderToMaker[orderHash] = order.maker;

        // Place order in the ClobPair
        (bytes32 returnedHash,) = IClobPair(clobPair).placeLimitOrder(order);
        require(returnedHash == orderHash, "Router: hash mismatch");

        emit OrderPlaced(orderHash, order.maker, clobPair, order);
        return orderHash;
    }

    /**
     * @notice Cancel an order with signature validation
     */
    function cancelOrder(
        OrderStructs.LimitOrder calldata order,
        bytes calldata signature
    ) external override nonReentrant {
        bytes32 orderHash = _hashLimitOrder(order);
        
        // Verify the maker is the message sender or signature is valid
        if (order.maker != msg.sender) {
            require(signature.length > 0, "Router: signature required");
            bytes32 cancelHash = _hashCancelOrder(orderHash, order.nonce);
            _verifySignature(cancelHash, signature, order.maker);
        }

        // Verify order exists and get maker
        address storedMaker = orderToMaker[orderHash];
        require(storedMaker != address(0), "Router: order not found");
        require(storedMaker == order.maker, "Router: unauthorized cancellation");

        // Find the appropriate ClobPair
        address clobPair = _findClobPairWithTickSize(order.baseToken, order.quoteToken, order.price);

        // Cancel order in the ClobPair
        IClobPair(clobPair).cancelOrder(order);

        // Clean up mapping
        delete orderToMaker[orderHash];

        emit OrderCancelled(orderHash, order.maker, clobPair);
    }

    /**
     * @notice Cancel order by hash (for makers only)
     */
    function cancelOrderByHash(bytes32 orderHash) external override nonReentrant {
        address maker = orderToMaker[orderHash];
        require(maker != address(0), "Router: order not found");
        require(maker == msg.sender, "Router: unauthorized cancellation");

        // We need to find the clobPair, but we don't have the order details
        // This is a limitation - we'd need to store more order info or iterate through pairs
        // For now, let's revert with a helpful message
        revert("Router: use cancelOrder with full order struct");
    }

    /**
     * @notice Place multiple limit orders in batch
     */
    function batchPlaceLimitOrders(
        OrderStructs.LimitOrder[] calldata orders,
        bytes[] calldata signatures
    ) external override nonReentrant {
        require(orders.length == signatures.length, "Router: array length mismatch");
        require(orders.length > 0, "Router: empty arrays");

        for (uint256 i = 0; i < orders.length; i++) {
            // Validate each order
            require(orders[i].maker != address(0), "Router: invalid maker");
            require(orders[i].baseToken != address(0) && orders[i].quoteToken != address(0), "Router: invalid tokens");
            require(orders[i].baseToken != orders[i].quoteToken, "Router: identical tokens");
            require(orders[i].baseAmount > 0, "Router: zero amount");
            require(orders[i].price > 0, "Router: zero price");
            require(orders[i].expiry == 0 || orders[i].expiry > block.timestamp, "Router: expired order");

            // Process the order
            bytes32 orderHash = _hashLimitOrder(orders[i]);

            // Verify signature if not self-placing
            if (orders[i].maker != msg.sender) {
                require(signatures[i].length > 0, "Router: signature required");
                _verifySignature(orderHash, signatures[i], orders[i].maker);
            }

            // Verify and update nonce
            require(orders[i].nonce >= userNonces[orders[i].maker], "Router: invalid nonce");
            userNonces[orders[i].maker] = orders[i].nonce + 1;

            // Find appropriate ClobPair
            address clobPair = _findClobPairWithTickSize(orders[i].baseToken, orders[i].quoteToken, orders[i].price);

            // Store order hash to maker mapping
            orderToMaker[orderHash] = orders[i].maker;

            // Place order
            (bytes32 returnedHash,) = IClobPair(clobPair).placeLimitOrder(orders[i]);
            require(returnedHash == orderHash, "Router: hash mismatch");

            emit OrderPlaced(orderHash, orders[i].maker, clobPair, orders[i]);
        }

        emit BatchOrdersPlaced(msg.sender, orders.length);
    }

    /**
     * @notice Cancel multiple orders in batch
     */
    function batchCancelOrders(
        OrderStructs.LimitOrder[] calldata orders,
        bytes[] calldata signatures
    ) external override nonReentrant {
        require(orders.length == signatures.length, "Router: array length mismatch");
        require(orders.length > 0, "Router: empty arrays");

        for (uint256 i = 0; i < orders.length; i++) {
            bytes32 orderHash = _hashLimitOrder(orders[i]);

            // Verify signature if not self-cancelling
            if (orders[i].maker != msg.sender) {
                require(signatures[i].length > 0, "Router: signature required");
                bytes32 cancelHash = _hashCancelOrder(orderHash, orders[i].nonce);
                _verifySignature(cancelHash, signatures[i], orders[i].maker);
            }

            // Verify order exists
            address storedMaker = orderToMaker[orderHash];
            require(storedMaker != address(0), "Router: order not found");
            require(storedMaker == orders[i].maker, "Router: unauthorized cancellation");

            // Find appropriate ClobPair
            address clobPair = _findClobPairWithTickSize(orders[i].baseToken, orders[i].quoteToken, orders[i].price);

            // Cancel order
            IClobPair(clobPair).cancelOrder(orders[i]);

            // Clean up mapping
            delete orderToMaker[orderHash];

            emit OrderCancelled(orderHash, orders[i].maker, clobPair);
        }

        emit BatchOrdersCancelled(msg.sender, orders.length);
    }

    // ---- View Functions ----

    /**
     * @notice Get the factory address
     */
    function getFactory() external view override returns (address) {
        return factory;
    }

    /**
     * @notice Get the EIP-712 domain separator
     */
    function domainSeparator() external view override returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice Hash a limit order for signing
     */
    function hashOrder(OrderStructs.LimitOrder calldata order) external view override returns (bytes32) {
        return _hashLimitOrder(order);
    }

    /**
     * @notice Get user's current nonce
     */
    function getUserNonce(address user) external view returns (uint256) {
        return userNonces[user];
    }

    /**
     * @notice Get maker address for an order hash
     */
    function getOrderMaker(bytes32 orderHash) external view returns (address) {
        return orderToMaker[orderHash];
    }

    /**
     * @notice Check if an order exists in the router
     */
    function orderExists(bytes32 orderHash) external view returns (bool) {
        return orderToMaker[orderHash] != address(0);
    }

    // ---- Utility Functions ----

    /**
     * @notice Find all compatible ClobPairs for a token pair
     */
    function getCompatiblePairs(address baseToken, address quoteToken) 
        external 
        view 
        returns (address[] memory pairs) 
    {
        address[] memory allPairs = IClobFactory(factory).getAllPairs();
        uint256 compatibleCount = 0;
        
        // Count compatible pairs first
        for (uint256 i = 0; i < allPairs.length; i++) {
            (address pairBase, address pairQuote,) = IClobPair(allPairs[i]).getPairInfo();
            if ((pairBase == baseToken && pairQuote == quoteToken) ||
                (pairBase == quoteToken && pairQuote == baseToken)) {
                compatibleCount++;
            }
        }
        
        // Build result array
        pairs = new address[](compatibleCount);
        uint256 index = 0;
        
        for (uint256 i = 0; i < allPairs.length; i++) {
            (address pairBase, address pairQuote,) = IClobPair(allPairs[i]).getPairInfo();
            if ((pairBase == baseToken && pairQuote == quoteToken) ||
                (pairBase == quoteToken && pairQuote == baseToken)) {
                pairs[index] = allPairs[i];
                index++;
            }
        }
    }

    /**
     * @notice Get the optimal tick size for a given price
     */
    function getOptimalTickSize(uint256 price) external pure returns (uint256) {
        if (price % 1e18 == 0) return 1e18;      // 1.0
        if (price % 1e17 == 0) return 1e17;      // 0.1
        if (price % 1e16 == 0) return 1e16;      // 0.01
        if (price % 1e15 == 0) return 1e15;      // 0.001
        return 1e12;                             // 0.000001 (default)
    }
}