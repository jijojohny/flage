// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/TEEAttestationVerifier.sol";
import "../src/FlageVerifier.sol";
import "../src/FlageAgentNFT.sol";
import "../src/FlageVault.sol";
import "../src/DEXRouter.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Optional: Aave V3 flash loan provider on the target network (0 = disabled)
        address flashLoanProvider = vm.envOr("FLASH_LOAN_PROVIDER", address(0));

        vm.startBroadcast(deployerKey);

        // 1. Deploy TEE Attestation Verifier
        //    Pass address(0) for dcapVerifier — wire to Intel Trust Authority later.
        TEEAttestationVerifier teeVerifier = new TEEAttestationVerifier(address(0));
        console.log("TEEAttestationVerifier deployed at:", address(teeVerifier));

        // 2. Deploy FlageVerifier (ERC-7857 transfer proof verifier)
        FlageVerifier verifier = new FlageVerifier(address(teeVerifier));
        console.log("FlageVerifier deployed at:", address(verifier));

        // 3. Deploy DEX Router
        DEXRouter router = new DEXRouter(flashLoanProvider);
        console.log("DEXRouter deployed at:", address(router));

        // 4. Deploy Agent NFT (ERC-7857)
        FlageAgentNFT nft = new FlageAgentNFT(
            address(verifier),
            "Flage Agent",
            "FLAGE"
        );
        console.log("FlageAgentNFT deployed at:", address(nft));

        // 5. Deploy Vault
        FlageVault vault = new FlageVault(address(router));
        console.log("FlageVault deployed at:", address(vault));

        // 6. Wire Vault into Router
        router.setVault(address(vault));

        // 7. Log deployment summary
        console.log("---");
        console.log("Network: Chain ID", block.chainid);
        console.log("Deployer:", deployer);
        console.log("---");
        console.log("TEE_ATTESTATION_VERIFIER=", address(teeVerifier));
        console.log("VERIFIER_ADDRESS=", address(verifier));
        console.log("ROUTER_ADDRESS=", address(router));
        console.log("NFT_ADDRESS=", address(nft));
        console.log("VAULT_ADDRESS=", address(vault));

        vm.stopBroadcast();
    }
}
