// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Controllable stub for ITEEAttestation used in FlageVerifier tests.
contract MockTEEAttestation {
    bool public returnValue = true;

    function setReturnValue(bool v) external { returnValue = v; }

    function verifyTEESignature(bytes32, bytes calldata) external view returns (bool) {
        return returnValue;
    }
}
