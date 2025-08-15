// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../src/Router.sol";
import "../src/ClobFactory.sol";
import "../src/ClobPair.sol";
import "../src/Vault.sol";
import "../src/libraries/OrderStructs.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1000000 * 10**18);
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RouterSignatureTest is Test {
    Router public router;
    ClobFactory public factory;
    Vault public vault;
    MockERC20 public baseToken;
    MockERC20 public quoteToken;
    
    address public maker;
    uint256 public makerPrivateKey;
    address public taker;
    uint256 public takerPrivateKey;
    
    uint256 constant TICK_SIZE = 1e15; // 0.001
    
    function setUp() public {
        // Create test accounts
        makerPrivateKey = 0x1234;
        maker = vm.addr(makerPrivateKey);
        takerPrivateKey = 0x5678;
        taker = vm.addr(takerPrivateKey);
        
        // Deploy tokens
        baseToken = new MockERC20("Base Token", "BASE");
        quoteToken = new MockERC20("Quote Token", "QUOTE");
        
        // Deploy vault
        vault = new Vault();
        
        // Deploy factory
        factory = new ClobFactory(address(vault));
        
        // Deploy router
        router = new Router(address(factory));

        // Add tokens to vault's supported list
        vault.addSupportedToken(address(baseToken));
        vault.addSupportedToken(address(quoteToken));

        // Create a trading pair
        address clobPair = factory.createClobPair(address(baseToken), address(quoteToken), TICK_SIZE);

        // Authorize the ClobPair as executor in vault
        vault.authorizeExecutor(clobPair, true);
        
        // Mint tokens to test accounts
        baseToken.mint(maker, 1000 * 10**18);
        quoteToken.mint(maker, 1000 * 10**18);
        baseToken.mint(taker, 1000 * 10**18);
        quoteToken.mint(taker, 1000 * 10**18);
        
        // Give some ETH to test accounts
        vm.deal(maker, 10 ether);
        vm.deal(taker, 10 ether);
    }
    
    function testEIP712DomainSeparator() public {
        bytes32 domainSeparator = router.domainSeparator();
        assertNotEq(domainSeparator, bytes32(0), "Domain separator should not be zero");
        
        // Test that domain separator is consistent
        bytes32 domainSeparator2 = router.domainSeparator();
        assertEq(domainSeparator, domainSeparator2, "Domain separator should be consistent");
    }
    
    function testOrderHashConsistency() public {
        // Ensure tokens are in canonical order (baseToken < quoteToken)
        (address token0, address token1) = address(baseToken) < address(quoteToken)
            ? (address(baseToken), address(quoteToken))
            : (address(quoteToken), address(baseToken));

        OrderStructs.LimitOrder memory order = OrderStructs.LimitOrder({
            maker: maker,
            baseToken: token0,
            quoteToken: token1,
            baseAmount: 100 * 10**6, // Use smaller amount that fits in uint64
            price: 1000 * TICK_SIZE, // Price must be multiple of tick size
            isSellBase: true,
            expiry: block.timestamp + 3600,
            nonce: 0
        });
        
        bytes32 hash1 = router.hashOrder(order);
        bytes32 hash2 = router.hashOrder(order);
        
        assertEq(hash1, hash2, "Order hash should be consistent");
        assertNotEq(hash1, bytes32(0), "Order hash should not be zero");
    }
    
    function testSignatureVerification() public {
        // Ensure tokens are in canonical order
        (address token0, address token1) = address(baseToken) < address(quoteToken)
            ? (address(baseToken), address(quoteToken))
            : (address(quoteToken), address(baseToken));

        OrderStructs.LimitOrder memory order = OrderStructs.LimitOrder({
            maker: maker,
            baseToken: token0,
            quoteToken: token1,
            baseAmount: 100 * 10**6,
            price: 1000 * TICK_SIZE,
            isSellBase: true,
            expiry: block.timestamp + 3600,
            nonce: 0
        });
        
        bytes32 orderHash = router.hashOrder(order);
        
        // Sign the order hash with maker's private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, orderHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Test placing order with valid signature
        vm.prank(taker); // Taker places order on behalf of maker
        bytes32 returnedHash = router.placeLimitOrder(order, signature);
        
        assertEq(returnedHash, orderHash, "Returned hash should match calculated hash");
        assertTrue(router.orderExists(orderHash), "Order should exist after placement");
        assertEq(router.getOrderMaker(orderHash), maker, "Order maker should be correct");
    }
    
    function testInvalidSignature() public {
        // Ensure tokens are in canonical order
        (address token0, address token1) = address(baseToken) < address(quoteToken)
            ? (address(baseToken), address(quoteToken))
            : (address(quoteToken), address(baseToken));

        OrderStructs.LimitOrder memory order = OrderStructs.LimitOrder({
            maker: maker,
            baseToken: token0,
            quoteToken: token1,
            baseAmount: 100 * 10**6,
            price: 1000 * TICK_SIZE,
            isSellBase: true,
            expiry: block.timestamp + 3600,
            nonce: 0
        });
        
        // Create invalid signature (signed with wrong private key)
        bytes32 orderHash = router.hashOrder(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(takerPrivateKey, orderHash); // Wrong key
        bytes memory invalidSignature = abi.encodePacked(r, s, v);
        
        // Should revert with invalid signature
        vm.prank(taker);
        vm.expectRevert("Router: invalid signature");
        router.placeLimitOrder(order, invalidSignature);
    }
    
    function testSelfPlacedOrder() public {
        // Ensure tokens are in canonical order
        (address token0, address token1) = address(baseToken) < address(quoteToken)
            ? (address(baseToken), address(quoteToken))
            : (address(quoteToken), address(baseToken));

        OrderStructs.LimitOrder memory order = OrderStructs.LimitOrder({
            maker: maker,
            baseToken: token0,
            quoteToken: token1,
            baseAmount: 100 * 10**6,
            price: 1000 * TICK_SIZE,
            isSellBase: true,
            expiry: block.timestamp + 3600,
            nonce: 0
        });
        
        // Maker places their own order (no signature needed)
        vm.prank(maker);
        bytes32 orderHash = router.placeLimitOrder(order, "");
        
        assertTrue(router.orderExists(orderHash), "Self-placed order should exist");
        assertEq(router.getOrderMaker(orderHash), maker, "Order maker should be correct");
    }
    
    function testNonceValidation() public {
        // Ensure tokens are in canonical order
        (address token0, address token1) = address(baseToken) < address(quoteToken)
            ? (address(baseToken), address(quoteToken))
            : (address(quoteToken), address(baseToken));

        OrderStructs.LimitOrder memory order = OrderStructs.LimitOrder({
            maker: maker,
            baseToken: token0,
            quoteToken: token1,
            baseAmount: 100 * 10**6,
            price: 1000 * TICK_SIZE,
            isSellBase: true,
            expiry: block.timestamp + 3600,
            nonce: 0
        });
        
        // Place first order
        vm.prank(maker);
        router.placeLimitOrder(order, "");
        
        // Try to place order with same nonce (should fail)
        vm.prank(maker);
        vm.expectRevert("Router: invalid nonce");
        router.placeLimitOrder(order, "");
        
        // Place order with correct nonce
        order.nonce = 1;
        vm.prank(maker);
        router.placeLimitOrder(order, "");
        
        assertEq(router.getUserNonce(maker), 2, "User nonce should be incremented");
    }
    
    function testCancelOrderSignature() public {
        // Ensure tokens are in canonical order
        (address token0, address token1) = address(baseToken) < address(quoteToken)
            ? (address(baseToken), address(quoteToken))
            : (address(quoteToken), address(baseToken));

        OrderStructs.LimitOrder memory order = OrderStructs.LimitOrder({
            maker: maker,
            baseToken: token0,
            quoteToken: token1,
            baseAmount: 100 * 10**6,
            price: 1000 * TICK_SIZE,
            isSellBase: true,
            expiry: block.timestamp + 3600,
            nonce: 0
        });
        
        // Place order first
        vm.prank(maker);
        bytes32 orderHash = router.placeLimitOrder(order, "");
        
        // Create cancel signature
        bytes32 cancelHash = keccak256(abi.encode(
            keccak256("CancelOrder(bytes32 orderHash,uint256 nonce)"),
            orderHash,
            order.nonce
        ));
        cancelHash = keccak256(abi.encodePacked("\x19\x01", router.domainSeparator(), cancelHash));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, cancelHash);
        bytes memory cancelSignature = abi.encodePacked(r, s, v);
        
        // Cancel order with signature (from different account)
        vm.prank(taker);
        router.cancelOrder(order, cancelSignature);
        
        assertFalse(router.orderExists(orderHash), "Order should not exist after cancellation");
    }
}
