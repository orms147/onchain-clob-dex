// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import "forge-std/Script.sol";
import "../src/ClobFactory.sol";
import "../src/Vault.sol";

contract DeployClobFactory is Script {
    function run() external returns (ClobFactory factory) {
        vm.startBroadcast();

        address vaultAddress = vm.envAddress("VAULT_ADDR");

        factory = new ClobFactory(vaultAddress);
        
        try Vault(vaultAddress).transferOwnership(address(factory)) {
        } catch {}

        vm.stopBroadcast();
    }
}
