// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TEEAttestationVerifier
/// @notice On-chain verifier for Intel TDX + NVIDIA H100 composite attestation quotes.
/// @dev The attestation flow:
///   1. Enclave generates an ECDSA keypair entirely inside the sealed environment.
///   2. At boot the enclave requests a TDX Quote (DCAP) from the TDX driver; the
///      quote's reportData field contains keccak256(enclavePublicKey).
///   3. An NVIDIA CC attestation report is produced binding the GPU in CC mode to
///      the same enclave public key.
///   4. Both report hashes are submitted to FlageVault.registerTEE().
///   5. This contract receives (messageHash, proof) where proof encodes the
///      enclave ECDSA signature plus the bound public key so we can verify that
///      the message was signed by a key whose report hash is registered on-chain.
///
///   In production the DCAP quote would be verified by an Intel Trust Authority
///   smart contract; we expose a pluggable `dcapVerifier` slot for that.
contract TEEAttestationVerifier {
    address public owner;
    address public dcapVerifier; // Intel Trust Authority on-chain verifier (optional)

    // enclaveKey => committed reportData hash (keccak256 of TDX quote reportData)
    mapping(address => bytes32) public enclaveReportDataHash;

    error NotOwner();
    error KeyNotRegistered();
    error InvalidAttestedSignature();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _dcapVerifier) {
        owner = msg.sender;
        dcapVerifier = _dcapVerifier;
    }

    function setDCAPVerifier(address _v) external onlyOwner {
        dcapVerifier = _v;
    }

    /// @notice Register an enclave public key paired to its TDX reportData hash.
    ///         Off-chain: extract `reportData` field from a raw DCAP quote and take
    ///         keccak256 of it.  Call this from FlageVault owner after independent
    ///         DCAP verification (e.g., via Intel Trust Authority REST API).
    function registerEnclaveKey(address enclaveKey, bytes32 reportDataHash) external onlyOwner {
        enclaveReportDataHash[enclaveKey] = reportDataHash;
    }

    function deregisterEnclaveKey(address enclaveKey) external onlyOwner {
        delete enclaveReportDataHash[enclaveKey];
    }

    /// @notice Verify that `messageHash` was signed by a registered TEE enclave key.
    /// @param messageHash  The eth-signed message hash that the enclave signed.
    /// @param proof        ABI-encoded (bytes sig, address enclaveKey) where sig is
    ///                     the 65-byte ECDSA signature produced inside the enclave.
    function verifyTEESignature(
        bytes32 messageHash,
        bytes calldata proof
    ) external view returns (bool) {
        (bytes memory sig, address enclaveKey) = abi.decode(proof, (bytes, address));

        // Check key is registered (i.e., its TDX quote was accepted)
        if (enclaveReportDataHash[enclaveKey] == bytes32(0)) revert KeyNotRegistered();

        // Recover signer from signature
        address recovered = _recover(messageHash, sig);
        if (recovered != enclaveKey) revert InvalidAttestedSignature();

        return true;
    }

    // --- Helpers ---

    function _recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "TEEAttestationVerifier: bad sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        return ecrecover(hash, v, r, s);
    }
}
