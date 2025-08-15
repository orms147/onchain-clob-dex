// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import "forge-std/Script.sol";
import "../src/Router.sol";

contract DeployRouter is Script {
    function run() external returns (Router router) {
        vm.startBroadcast();

        address factoryAddress =  vm.envAddress("FACTORY_ADDR"); // factory address

        router = new Router(factoryAddress);

        vm.stopBroadcast();
    }
}
