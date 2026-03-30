// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC7857DataVerifier {
    enum OracleType {
        TEE,
        ZKP
    }

    struct AccessProof {
        bytes32 oldDataHash;
        bytes32 newDataHash;
        bytes nonce;
        bytes encryptedPubKey;
        bytes proof;
    }

    struct OwnershipProof {
        OracleType oracleType;
        bytes32 oldDataHash;
        bytes32 newDataHash;
        bytes sealedKey;
        bytes encryptedPubKey;
        bytes nonce;
        bytes proof;
    }

    struct TransferValidityProof {
        AccessProof accessProof;
        OwnershipProof ownershipProof;
    }

    struct TransferValidityProofOutput {
        bytes32 oldDataHash;
        bytes32 newDataHash;
        bytes sealedKey;
        bytes encryptedPubKey;
        bytes wantedKey;
        address accessAssistant;
        bytes accessProofNonce;
        bytes ownershipProofNonce;
    }

    function verifyTransferValidity(
        TransferValidityProof[] calldata _proofs
    ) external returns (TransferValidityProofOutput[] memory);
}

interface IERC7857 {
    event Approval(address indexed _from, address indexed _to, uint256 indexed _tokenId);
    event ApprovalForAll(address indexed _owner, address indexed _operator, bool _approved);
    event Authorization(address indexed _from, address indexed _to, uint256 indexed _tokenId);
    event AuthorizationRevoked(address indexed _from, address indexed _to, uint256 indexed _tokenId);
    event Transferred(uint256 _tokenId, address indexed _from, address indexed _to);
    event Cloned(uint256 indexed _tokenId, uint256 indexed _newTokenId, address _from, address _to);
    event PublishedSealedKey(address indexed _to, uint256 indexed _tokenId, bytes[] _sealedKeys);
    event DelegateAccess(address indexed _user, address indexed _assistant);

    function verifier() external view returns (IERC7857DataVerifier);

    function iTransfer(
        address _to,
        uint256 _tokenId,
        IERC7857DataVerifier.TransferValidityProof[] calldata _proofs
    ) external;

    function iClone(
        address _to,
        uint256 _tokenId,
        IERC7857DataVerifier.TransferValidityProof[] calldata _proofs
    ) external returns (uint256 _newTokenId);

    function authorizeUsage(uint256 _tokenId, address _user) external;
    function revokeAuthorization(uint256 _tokenId, address _user) external;
    function approve(address _to, uint256 _tokenId) external;
    function setApprovalForAll(address _operator, bool _approved) external;
    function delegateAccess(address _assistant) external;
    function ownerOf(uint256 _tokenId) external view returns (address);
    function authorizedUsersOf(uint256 _tokenId) external view returns (address[] memory);
    function getApproved(uint256 _tokenId) external view returns (address);
    function isApprovedForAll(address _owner, address _operator) external view returns (bool);
    function getDelegateAccess(address _user) external view returns (address);
}

interface IERC7857Metadata {
    struct IntelligentData {
        string dataDescription;
        bytes32 dataHash;
    }

    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function intelligentDataOf(uint256 _tokenId) external view returns (IntelligentData[] memory);
}
