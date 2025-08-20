// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import "forge-std/Script.sol";
import "../src/Router.sol";
import "../src/ClobFactory.sol";

contract DeployRouter is Script {
    function run() external returns (Router router) {
        vm.startBroadcast();

        address factoryAddress = vm.envAddress("FACTORY_ADDR");

        router = new Router(factoryAddress);

        try ClobFactory(factoryAddress).setRouter(address(router)) {
        } catch {}

        vm.stopBroadcast();
    }
}
