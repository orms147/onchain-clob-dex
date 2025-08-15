// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import "forge-std/Script.sol";
import "../src/Router.sol";

contract DeployRouter is Script {
    function run() external returns (Router router) {
        vm.startBroadcast();

        address factoryAddress = 0x0367709cA277f50095BB42Bf4c9426CDb2C98EDb; // factory address

        router = new Router(factoryAddress);

        vm.stopBroadcast();
    }
}
