// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../src/ClobPair.sol";
import "../src/Vault.sol";
import "../src/ClobFactory.sol";
import "../src/libraries/OrderStructs.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1000000 * 10**decimals());
    }
}

contract ClobPairTest is Test {
    Vault public vault;
    ClobFactory public factory;
    ClobPair public pair;
    MockToken public baseToken;
    MockToken public quoteToken;
    
    address public alice = address(0x1);
    address public bob = address(0x2);
    
    function setUp() public {
        // Deploy tokens
        baseToken = new MockToken("Base", "BASE");
        quoteToken = new MockToken("Quote", "QUOTE");
        
        // Deploy vault
        vault = new Vault();
        
        // Add tokens to vault
        vault.addSupportedToken(address(baseToken));
        vault.addSupportedToken(address(quoteToken));
        
        // Deploy factory
        factory = new ClobFactory(address(vault));
        
        // Authorize factory as executor
        vault.authorizeExecutor(address(factory), true);
        
        // Create pair
        pair = ClobPair(factory.createClobPair(address(baseToken), address(quoteToken), 1000));
        
        // Authorize pair as executor
        vault.authorizeExecutor(address(pair), true);
        
        // Setup users
        baseToken.transfer(alice, 10000 * 10**baseToken.decimals());
        quoteToken.transfer(alice, 10000 * 10**quoteToken.decimals());
        baseToken.transfer(bob, 10000 * 10**baseToken.decimals());
        quoteToken.transfer(bob, 10000 * 10**quoteToken.decimals());
        
        vm.startPrank(alice);
        baseToken.approve(address(vault), type(uint256).max);
        quoteToken.approve(address(vault), type(uint256).max);
        vault.deposit(address(baseToken), 5000 * 10**baseToken.decimals());
        vault.deposit(address(quoteToken), 5000 * 10**quoteToken.decimals());
        vm.stopPrank();
        
        vm.startPrank(bob);
        baseToken.approve(address(vault), type(uint256).max);
        quoteToken.approve(address(vault), type(uint256).max);
        vault.deposit(address(baseToken), 5000 * 10**baseToken.decimals());
        vault.deposit(address(quoteToken), 5000 * 10**quoteToken.decimals());
        vm.stopPrank();
    }
    
    function testCreatePair() public {
        assertEq(pair.baseToken(), address(baseToken));
        assertEq(pair.quoteToken(), address(quoteToken));
        assertEq(pair.tickSize(), 1000);
        assertEq(pair.vault(), address(vault));
    }
    
    function testPlaceLimitOrder() public {
        OrderStructs.LimitOrder memory order = OrderStructs.LimitOrder({
            maker: alice,
            baseToken: address(baseToken),
            quoteToken: address(quoteToken),
            baseAmount: 100 * 10**baseToken.decimals(),
            price: 2000, // 2.0 quote per base
            isSellBase: true,
            expiry: block.timestamp + 3600,
            nonce: 1
        });
        
        vm.prank(alice);
        (bytes32 orderHash, uint64 orderId) = pair.placeLimitOrder(order);
        
        assertTrue(orderHash != bytes32(0));
        assertTrue(orderId > 0);
    }
}
