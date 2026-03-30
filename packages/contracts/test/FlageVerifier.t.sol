// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FlageVerifier.sol";
import "./mocks/MockTEEAttestation.sol";

contract FlageVerifierTest is Test {
    FlageVerifier verifier;
    MockTEEAttestation mockAttestation;

    address owner = address(1);
    uint256 teePrivKey = 0xBEEFCAFE;
    address teeSigner;

    function setUp() public {
        mockAttestation = new MockTEEAttestation();
        vm.prank(owner);
        verifier = new FlageVerifier(address(mockAttestation));
        teeSigner = vm.addr(teePrivKey);
    }

    // -------------------------------------------------------------------------
    // setTEEAttestationContract
    // -------------------------------------------------------------------------

    function test_SetTEEAttestationContract() public {
        address newAttestation = address(99);
        vm.prank(owner);
        verifier.setTEEAttestationContract(newAttestation);
        assertEq(verifier.teeAttestationContract(), newAttestation);
    }

    function test_RevertSetTEEAttestationNotOwner() public {
        vm.expectRevert(FlageVerifier.NotOwner.selector);
        verifier.setTEEAttestationContract(address(99));
    }

    // -------------------------------------------------------------------------
    // verifyTransferValidity — happy path
    // -------------------------------------------------------------------------

    function test_VerifyTransferValidityTEE() public {
        IERC7857DataVerifier.TransferValidityProof[] memory proofs = _buildProofs(
            0x1111111111111111111111111111111111111111111111111111111111111111,
            0x2222222222222222222222222222222222222222222222222222222222222222,
            bytes("nonce-ownership-1"),
            bytes("nonce-access-1"),
            IERC7857DataVerifier.OracleType.TEE
        );

        IERC7857DataVerifier.TransferValidityProofOutput[] memory outputs =
            verifier.verifyTransferValidity(proofs);

        assertEq(outputs.length, 1);
        assertEq(outputs[0].oldDataHash, proofs[0].ownershipProof.oldDataHash);
        assertEq(outputs[0].newDataHash, proofs[0].ownershipProof.newDataHash);
    }

    function test_VerifyTransferValidityZKP() public {
        // OracleType.ZKP: TEE verification skipped entirely
        IERC7857DataVerifier.TransferValidityProof[] memory proofs = _buildProofs(
            bytes32(uint256(1)),
            bytes32(uint256(2)),
            bytes("nonce-op-2"),
            bytes("nonce-ap-2"),
            IERC7857DataVerifier.OracleType.ZKP
        );

        IERC7857DataVerifier.TransferValidityProofOutput[] memory outputs =
            verifier.verifyTransferValidity(proofs);

        assertEq(outputs.length, 1);
    }

    function test_VerifyMultipleProofs() public {
        IERC7857DataVerifier.TransferValidityProof[] memory proofs =
            new IERC7857DataVerifier.TransferValidityProof[](3);

        for (uint256 i = 0; i < 3; i++) {
            proofs[i] = _singleProof(
                bytes32(uint256(i + 1)),
                bytes32(uint256(i + 100)),
                abi.encodePacked("ownership-nonce-", i),
                abi.encodePacked("access-nonce-", i),
                IERC7857DataVerifier.OracleType.ZKP
            );
        }

        IERC7857DataVerifier.TransferValidityProofOutput[] memory outputs =
            verifier.verifyTransferValidity(proofs);

        assertEq(outputs.length, 3);
    }

    // -------------------------------------------------------------------------
    // Replay protection
    // -------------------------------------------------------------------------

    function test_RevertOnNonceReplay() public {
        IERC7857DataVerifier.TransferValidityProof[] memory proofs = _buildProofs(
            bytes32(uint256(1)),
            bytes32(uint256(2)),
            bytes("replay-nonce"),
            bytes("access-nonce-rp"),
            IERC7857DataVerifier.OracleType.ZKP
        );

        verifier.verifyTransferValidity(proofs);

        // Same proof → same ownership nonce → should revert
        vm.expectRevert(FlageVerifier.ProofAlreadyUsed.selector);
        verifier.verifyTransferValidity(proofs);
    }

    // -------------------------------------------------------------------------
    // Invalid TEE proof
    // -------------------------------------------------------------------------

    function test_RevertOnInvalidTEEProof() public {
        mockAttestation.setReturnValue(false);

        IERC7857DataVerifier.TransferValidityProof[] memory proofs = _buildProofs(
            bytes32(uint256(10)),
            bytes32(uint256(20)),
            bytes("bad-tee-nonce"),
            bytes("bad-access-nonce"),
            IERC7857DataVerifier.OracleType.TEE
        );

        vm.expectRevert(FlageVerifier.InvalidTEEProof.selector);
        verifier.verifyTransferValidity(proofs);
    }

    function test_TEESkippedWhenContractIsZero() public {
        // Override attestation contract with address(0)
        vm.prank(owner);
        verifier.setTEEAttestationContract(address(0));

        IERC7857DataVerifier.TransferValidityProof[] memory proofs = _buildProofs(
            bytes32(uint256(30)),
            bytes32(uint256(40)),
            bytes("zero-contract-nonce"),
            bytes("zero-access-nonce"),
            IERC7857DataVerifier.OracleType.TEE
        );

        // Should NOT revert — TEE check bypassed when no attestation contract
        IERC7857DataVerifier.TransferValidityProofOutput[] memory outputs =
            verifier.verifyTransferValidity(proofs);
        assertEq(outputs.length, 1);
    }

    // -------------------------------------------------------------------------
    // usedProofs mapping
    // -------------------------------------------------------------------------

    function test_UsedProofsMarked() public {
        IERC7857DataVerifier.TransferValidityProof[] memory proofs = _buildProofs(
            bytes32(uint256(50)),
            bytes32(uint256(60)),
            bytes("mark-nonce"),
            bytes("mark-access-nonce"),
            IERC7857DataVerifier.OracleType.ZKP
        );

        verifier.verifyTransferValidity(proofs);
        bytes32 nonceHash = keccak256(bytes("mark-nonce"));
        assertTrue(verifier.usedProofs(nonceHash));
    }

    // -------------------------------------------------------------------------
    // Fuzz
    // -------------------------------------------------------------------------

    function testFuzz_DistinctNoncesSucceed(bytes memory nonce1, bytes memory nonce2) public {
        vm.assume(keccak256(nonce1) != keccak256(nonce2));
        vm.assume(nonce1.length > 0 && nonce2.length > 0);

        IERC7857DataVerifier.TransferValidityProof[] memory p1 = _buildProofs(
            bytes32(uint256(1)), bytes32(uint256(2)), nonce1, bytes("an1"),
            IERC7857DataVerifier.OracleType.ZKP
        );
        IERC7857DataVerifier.TransferValidityProof[] memory p2 = _buildProofs(
            bytes32(uint256(3)), bytes32(uint256(4)), nonce2, bytes("an2"),
            IERC7857DataVerifier.OracleType.ZKP
        );

        verifier.verifyTransferValidity(p1);
        verifier.verifyTransferValidity(p2); // should not revert
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _buildProofs(
        bytes32 oldHash,
        bytes32 newHash,
        bytes memory ownershipNonce,
        bytes memory accessNonce,
        IERC7857DataVerifier.OracleType oracleType
    ) internal pure returns (IERC7857DataVerifier.TransferValidityProof[] memory proofs) {
        proofs = new IERC7857DataVerifier.TransferValidityProof[](1);
        proofs[0] = _singleProof(oldHash, newHash, ownershipNonce, accessNonce, oracleType);
    }

    function _singleProof(
        bytes32 oldHash,
        bytes32 newHash,
        bytes memory ownershipNonce,
        bytes memory accessNonce,
        IERC7857DataVerifier.OracleType oracleType
    ) internal pure returns (IERC7857DataVerifier.TransferValidityProof memory proof) {
        proof.accessProof = IERC7857DataVerifier.AccessProof({
            oldDataHash: oldHash,
            newDataHash: newHash,
            nonce: accessNonce,
            encryptedPubKey: hex"aabb",
            proof: hex""
        });
        proof.ownershipProof = IERC7857DataVerifier.OwnershipProof({
            oracleType: oracleType,
            oldDataHash: oldHash,
            newDataHash: newHash,
            sealedKey: hex"ccdd",
            encryptedPubKey: hex"aabb",
            nonce: ownershipNonce,
            proof: hex""
        });
    }
}
