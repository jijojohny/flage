// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC7857.sol";

interface ITEEAttestation {
    function verifyTEESignature(bytes32 messageHash, bytes calldata proof) external view returns (bool);
}

/// @title FlageVerifier
/// @notice Verifies TEE-based transfer validity proofs for ERC-7857 transfers
contract FlageVerifier is IERC7857DataVerifier {
    // TEE attestation contract (Intel Trust Authority integration)
    address public teeAttestationContract;
    address public owner;

    // Replay protection
    mapping(bytes32 => bool) public usedProofs;

    error ProofAlreadyUsed();
    error InvalidTEEProof();
    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _teeAttestationContract) {
        teeAttestationContract = _teeAttestationContract;
        owner = msg.sender;
    }

    function setTEEAttestationContract(address _contract) external onlyOwner {
        teeAttestationContract = _contract;
    }

    function verifyTransferValidity(
        TransferValidityProof[] calldata _proofs
    ) external override returns (TransferValidityProofOutput[] memory outputs) {
        outputs = new TransferValidityProofOutput[](_proofs.length);

        for (uint256 i = 0; i < _proofs.length; i++) {
            AccessProof calldata ap = _proofs[i].accessProof;
            OwnershipProof calldata op = _proofs[i].ownershipProof;

            // 1. Verify ownership proof nonce not reused
            bytes32 nonceHash = keccak256(op.nonce);
            if (usedProofs[nonceHash]) revert ProofAlreadyUsed();
            usedProofs[nonceHash] = true;

            // 2. Verify access proof — receiver acknowledged data availability
            bytes32 accessMsgHash = keccak256(abi.encodePacked(
                ap.oldDataHash,
                ap.newDataHash,
                ap.encryptedPubKey,
                ap.nonce
            ));
            bytes32 ethSignedAccessHash = _toEthSignedMessageHash(accessMsgHash);
            address accessSigner = _recover(ethSignedAccessHash, ap.proof);

            // 3. Verify ownership proof — TEE signed the re-encryption
            bytes32 ownershipMsgHash = keccak256(abi.encodePacked(
                op.oldDataHash,
                op.newDataHash,
                op.sealedKey,
                op.encryptedPubKey,
                op.nonce
            ));
            bytes32 ethSignedOwnershipHash = _toEthSignedMessageHash(ownershipMsgHash);

            if (op.oracleType == OracleType.TEE && teeAttestationContract != address(0)) {
                bool valid = ITEEAttestation(teeAttestationContract)
                    .verifyTEESignature(ethSignedOwnershipHash, op.proof);
                if (!valid) revert InvalidTEEProof();
            }
            // OracleType.ZKP: would verify ZK proof here

            outputs[i] = TransferValidityProofOutput({
                oldDataHash: op.oldDataHash,
                newDataHash: op.newDataHash,
                sealedKey: op.sealedKey,
                encryptedPubKey: op.encryptedPubKey,
                wantedKey: new bytes(0),
                accessAssistant: accessSigner,
                accessProofNonce: ap.nonce,
                ownershipProofNonce: op.nonce
            });
        }
    }

    function _toEthSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(hash, v, r, s);
    }
}
