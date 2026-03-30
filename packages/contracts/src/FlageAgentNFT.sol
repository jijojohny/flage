// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC7857.sol";

/// @title FlageAgentNFT
/// @notice ERC-7857 Intelligent NFT encapsulating the flage trading agent
/// @dev Stores encrypted model weights, memory, and strategy config on 0G Storage
contract FlageAgentNFT is IERC7857, IERC7857Metadata {
    // --- Storage ---

    struct AgentState {
        address owner;
        IntelligentData[] metadata;
        address[] authorizedUsers;
        mapping(address => bool) isAuthorized;
        address approved;
    }

    IERC7857DataVerifier private _verifier;
    string private _name;
    string private _symbol;

    mapping(uint256 => AgentState) private _agents;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(address => address) private _delegates; // user => access assistant

    uint256 private _nextTokenId;
    address public owner; // Protocol owner

    // --- Errors ---
    error NotOwner();
    error NotAuthorized();
    error TokenDoesNotExist();
    error ZeroAddress();

    // --- Modifiers ---
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier tokenExists(uint256 tokenId) {
        if (_agents[tokenId].owner == address(0)) revert TokenDoesNotExist();
        _;
    }

    constructor(address verifierAddress, string memory name_, string memory symbol_) {
        if (verifierAddress == address(0)) revert ZeroAddress();
        _verifier = IERC7857DataVerifier(verifierAddress);
        _name = name_;
        _symbol = symbol_;
        owner = msg.sender;
    }

    // --- IERC7857Metadata ---

    function name() external view override returns (string memory) {
        return _name;
    }

    function symbol() external view override returns (string memory) {
        return _symbol;
    }

    function intelligentDataOf(uint256 tokenId)
        external
        view
        override
        tokenExists(tokenId)
        returns (IntelligentData[] memory)
    {
        return _agents[tokenId].metadata;
    }

    // --- IERC7857 ---

    function verifier() external view override returns (IERC7857DataVerifier) {
        return _verifier;
    }

    function ownerOf(uint256 tokenId) external view override tokenExists(tokenId) returns (address) {
        return _agents[tokenId].owner;
    }

    function authorizedUsersOf(uint256 tokenId)
        external
        view
        override
        tokenExists(tokenId)
        returns (address[] memory)
    {
        return _agents[tokenId].authorizedUsers;
    }

    function getApproved(uint256 tokenId)
        external
        view
        override
        tokenExists(tokenId)
        returns (address)
    {
        return _agents[tokenId].approved;
    }

    function isApprovedForAll(address _owner, address operator)
        external
        view
        override
        returns (bool)
    {
        return _operatorApprovals[_owner][operator];
    }

    function getDelegateAccess(address user) external view override returns (address) {
        return _delegates[user];
    }

    function approve(address to, uint256 tokenId) external override tokenExists(tokenId) {
        address tokenOwner = _agents[tokenId].owner;
        if (msg.sender != tokenOwner && !_operatorApprovals[tokenOwner][msg.sender]) {
            revert NotAuthorized();
        }
        _agents[tokenId].approved = to;
        emit Approval(msg.sender, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external override {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function delegateAccess(address assistant) external override {
        _delegates[msg.sender] = assistant;
        emit DelegateAccess(msg.sender, assistant);
    }

    function authorizeUsage(uint256 tokenId, address user)
        external
        override
        tokenExists(tokenId)
    {
        if (msg.sender != _agents[tokenId].owner) revert NotAuthorized();
        if (!_agents[tokenId].isAuthorized[user]) {
            _agents[tokenId].isAuthorized[user] = true;
            _agents[tokenId].authorizedUsers.push(user);
        }
        emit Authorization(msg.sender, user, tokenId);
    }

    function revokeAuthorization(uint256 tokenId, address user)
        external
        override
        tokenExists(tokenId)
    {
        if (msg.sender != _agents[tokenId].owner) revert NotAuthorized();
        _agents[tokenId].isAuthorized[user] = false;
        // Remove from array
        address[] storage users = _agents[tokenId].authorizedUsers;
        for (uint256 i = 0; i < users.length; i++) {
            if (users[i] == user) {
                users[i] = users[users.length - 1];
                users.pop();
                break;
            }
        }
        emit AuthorizationRevoked(msg.sender, user, tokenId);
    }

    function iTransfer(
        address to,
        uint256 tokenId,
        IERC7857DataVerifier.TransferValidityProof[] calldata proofs
    ) external override tokenExists(tokenId) {
        address tokenOwner = _agents[tokenId].owner;
        if (
            msg.sender != tokenOwner &&
            msg.sender != _agents[tokenId].approved &&
            !_operatorApprovals[tokenOwner][msg.sender]
        ) revert NotAuthorized();
        if (to == address(0)) revert ZeroAddress();

        // Verify re-encryption proofs via Verifier contract
        IERC7857DataVerifier.TransferValidityProofOutput[] memory outputs =
            _verifier.verifyTransferValidity(proofs);

        // Update data hashes
        for (uint256 i = 0; i < outputs.length && i < _agents[tokenId].metadata.length; i++) {
            _agents[tokenId].metadata[i].dataHash = outputs[i].newDataHash;
        }

        // Transfer ownership
        address from = _agents[tokenId].owner;
        _agents[tokenId].owner = to;
        _agents[tokenId].approved = address(0);

        // Emit sealed keys for new owner
        bytes[] memory sealedKeys = new bytes[](outputs.length);
        for (uint256 i = 0; i < outputs.length; i++) {
            sealedKeys[i] = outputs[i].sealedKey;
        }
        emit PublishedSealedKey(to, tokenId, sealedKeys);
        emit Transferred(tokenId, from, to);
    }

    function iClone(
        address to,
        uint256 tokenId,
        IERC7857DataVerifier.TransferValidityProof[] calldata proofs
    ) external override tokenExists(tokenId) returns (uint256 newTokenId) {
        if (msg.sender != _agents[tokenId].owner) revert NotAuthorized();
        if (to == address(0)) revert ZeroAddress();

        IERC7857DataVerifier.TransferValidityProofOutput[] memory outputs =
            _verifier.verifyTransferValidity(proofs);

        newTokenId = _nextTokenId++;
        AgentState storage newAgent = _agents[newTokenId];
        newAgent.owner = to;

        // Copy metadata with new hashes
        for (uint256 i = 0; i < _agents[tokenId].metadata.length; i++) {
            IntelligentData memory d = _agents[tokenId].metadata[i];
            if (i < outputs.length) {
                d.dataHash = outputs[i].newDataHash;
            }
            newAgent.metadata.push(d);
        }

        bytes[] memory sealedKeys = new bytes[](outputs.length);
        for (uint256 i = 0; i < outputs.length; i++) {
            sealedKeys[i] = outputs[i].sealedKey;
        }
        emit PublishedSealedKey(to, newTokenId, sealedKeys);
        emit Cloned(tokenId, newTokenId, msg.sender, to);
    }

    // --- Mint (protocol owner only) ---

    function mint(
        address to,
        IntelligentData[] calldata data,
        bytes[] calldata sealedKeys
    ) external onlyOwner returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        tokenId = _nextTokenId++;
        AgentState storage agent = _agents[tokenId];
        agent.owner = to;
        for (uint256 i = 0; i < data.length; i++) {
            agent.metadata.push(data[i]);
        }
        emit PublishedSealedKey(to, tokenId, sealedKeys);
    }
}
