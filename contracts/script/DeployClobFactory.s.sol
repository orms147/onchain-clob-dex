// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import "forge-std/Script.sol";
import "../src/ClobFactory.sol";

contract DeployClobFactory is Script {
    function run() external returns (ClobFactory factory) {
        vm.startBroadcast();

        address vaultAddress = vm.envAddress("VAULT_ADDR"); // vault address 

        factory = new ClobFactory(vaultAddress);

        vm.stopBroadcast();
    }
}
