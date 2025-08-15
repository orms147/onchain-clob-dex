// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import "forge-std/Script.sol";
import "../src/ClobFactory.sol";

contract DeployClobFactory is Script {
    function run() external returns (ClobFactory factory) {
        vm.startBroadcast();

        address vaultAddress = 0x3824dAa3dc31De43B594c8D231347023Ab61D48f; // vault address 

        factory = new ClobFactory(vaultAddress);

        vm.stopBroadcast();
    }
}
