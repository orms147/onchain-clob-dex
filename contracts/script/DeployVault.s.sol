// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "../src/Vault.sol";

contract DeployVault is Script {
    function run() external returns (Vault vault) {
        vm.startBroadcast();

        vault = new Vault();

        vm.stopBroadcast();
    }
}
