// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../src/ClobFactory.sol";
import "../src/Vault.sol";

contract DeployClobFactory is Script {
    function run() external returns (ClobFactory factory) {
        vm.startBroadcast();

        address vaultAddress = vm.envAddress("VAULT_ADDR");
        require(vaultAddress != address(0), "VAULT_ADDR not set");

        factory = new ClobFactory(vaultAddress);
        console2.log("Factory deployed:", address(factory));

        address currentOwner = Vault(vaultAddress).owner();
        console2.log("Vault current owner:", currentOwner);

        bool transferred = false;
        try Vault(vaultAddress).transferOwnership(address(factory)) {
            transferred = true;
            console2.log("Vault ownership transferred to Factory.");
        } catch {
            console2.log("WARN: transferOwnership() failed. Broadcaster is likely not the current Vault owner.");
        }

        if (!transferred) {
            bool allowSkip = false;
            try vm.envBool("ALLOW_SKIP_VAULT_OWNERSHIP") returns (bool v) { allowSkip = v; } catch {}
            if (!allowSkip) {
                revert("Vault not owned by broadcaster; set ALLOW_SKIP_VAULT_OWNERSHIP=true to skip");
            } else {
                console2.log("Skipping ownership transfer per ALLOW_SKIP_VAULT_OWNERSHIP=true");
            }
        }

        vm.stopBroadcast();
    }
}
