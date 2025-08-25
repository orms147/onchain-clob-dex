// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../src/Router.sol";
import "../src/ClobFactory.sol";

contract DeployRouter is Script {
    function run() external returns (Router router) {
        vm.startBroadcast();

        address factoryAddress = vm.envAddress("FACTORY_ADDR");
        require(factoryAddress != address(0), "FACTORY_ADDR not set");

        router = new Router(factoryAddress);

        ClobFactory factory = ClobFactory(factoryAddress);
        factory.setRouter(address(router));

        require(factory.router() == address(router), "setRouter failed");
        console2.log("Router set in Factory:", address(router));

        vm.stopBroadcast();
    }
}
