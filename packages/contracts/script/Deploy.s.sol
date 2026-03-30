// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/FlageVerifier.sol";
import "../src/FlageAgentNFT.sol";
import "../src/FlageVault.sol";
import "../src/DEXRouter.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy Verifier (TEE attestation = address(0) initially — set later)
        FlageVerifier verifier = new FlageVerifier(address(0));
        console.log("FlageVerifier deployed at:", address(verifier));

        // 2. Deploy DEX Router
        DEXRouter router = new DEXRouter();
        console.log("DEXRouter deployed at:", address(router));

        // 3. Deploy Agent NFT (ERC-7857)
        FlageAgentNFT nft = new FlageAgentNFT(
            address(verifier),
            "Flage Agent",
            "FRTM"
        );
        console.log("FlageAgentNFT deployed at:", address(nft));

        // 4. Deploy Vault
        FlageVault vault = new FlageVault(address(router));
        console.log("FlageVault deployed at:", address(vault));

        // 5. Wire Vault into Router
        router.setVault(address(vault));

        // 6. Log deployment summary
        console.log("---");
        console.log("Network: Chain ID", block.chainid);
        console.log("Deployer:", deployer);
        console.log("---");
        console.log("VERIFIER_ADDRESS=", address(verifier));
        console.log("ROUTER_ADDRESS=", address(router));
        console.log("NFT_ADDRESS=", address(nft));
        console.log("VAULT_ADDRESS=", address(vault));

        vm.stopBroadcast();
    }
}
