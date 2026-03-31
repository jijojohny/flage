// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FlageAgentNFT.sol";
import "../src/FlageVerifier.sol";
import "./mocks/MockTEEAttestation.sol";

/// @dev Stub verifier that immediately accepts any proofs with identity output.
contract PassThroughVerifier is IERC7857DataVerifier {
    function verifyTransferValidity(
        TransferValidityProof[] calldata proofs
    ) external override returns (TransferValidityProofOutput[] memory outputs) {
        outputs = new TransferValidityProofOutput[](proofs.length);
        for (uint256 i = 0; i < proofs.length; i++) {
            OwnershipProof calldata op = proofs[i].ownershipProof;
            AccessProof calldata ap = proofs[i].accessProof;
            outputs[i] = TransferValidityProofOutput({
                oldDataHash: op.oldDataHash,
                newDataHash: op.newDataHash,
                sealedKey: op.sealedKey,
                encryptedPubKey: op.encryptedPubKey,
                wantedKey: new bytes(0),
                accessAssistant: address(0),
                accessProofNonce: ap.nonce,
                ownershipProofNonce: op.nonce
            });
        }
    }
}

contract FlageAgentNFTTest is Test {
    FlageAgentNFT nft;
    PassThroughVerifier verifier;

    address protocol = address(1);
    address alice = address(2);
    address bob = address(3);
    address charlie = address(4);

    function setUp() public {
        verifier = new PassThroughVerifier();
        vm.prank(protocol);
        nft = new FlageAgentNFT(address(verifier), "Flage Agent", "FLAGE");
    }

    // -------------------------------------------------------------------------
    // mint
    // -------------------------------------------------------------------------

    function test_MintToken() public {
        uint256 tokenId = _mint(alice);
        assertEq(nft.ownerOf(tokenId), alice);
        assertEq(tokenId, 0);
    }

    function test_MintIncrements() public {
        _mint(alice);
        uint256 id2 = _mint(bob);
        assertEq(id2, 1);
    }

    function test_RevertMintNotOwner() public {
        vm.prank(alice);
        IERC7857Metadata.IntelligentData[] memory data = new IERC7857Metadata.IntelligentData[](0);
        bytes[] memory keys = new bytes[](0);
        vm.expectRevert(FlageAgentNFT.NotOwner.selector);
        nft.mint(alice, data, keys);
    }

    function test_RevertMintZeroAddress() public {
        vm.prank(protocol);
        IERC7857Metadata.IntelligentData[] memory data = new IERC7857Metadata.IntelligentData[](0);
        bytes[] memory keys = new bytes[](0);
        vm.expectRevert(FlageAgentNFT.ZeroAddress.selector);
        nft.mint(address(0), data, keys);
    }

    // -------------------------------------------------------------------------
    // intelligentDataOf
    // -------------------------------------------------------------------------

    function test_IntelligentDataOf() public {
        uint256 tokenId = _mintWithData(alice);
        IERC7857Metadata.IntelligentData[] memory data = nft.intelligentDataOf(tokenId);
        assertEq(data.length, 1);
        assertEq(data[0].dataHash, bytes32(uint256(0xABCD)));
    }

    function test_RevertIntelligentDataNonExistent() public {
        vm.expectRevert(FlageAgentNFT.TokenDoesNotExist.selector);
        nft.intelligentDataOf(999);
    }

    // -------------------------------------------------------------------------
    // authorizeUsage / revokeAuthorization
    // -------------------------------------------------------------------------

    function test_AuthorizeUsage() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        nft.authorizeUsage(id, bob);
        address[] memory users = nft.authorizedUsersOf(id);
        assertEq(users.length, 1);
        assertEq(users[0], bob);
    }

    function test_AuthorizeIdempotent() public {
        uint256 id = _mint(alice);
        vm.startPrank(alice);
        nft.authorizeUsage(id, bob);
        nft.authorizeUsage(id, bob); // second call is a no-op
        vm.stopPrank();
        assertEq(nft.authorizedUsersOf(id).length, 1);
    }

    function test_RevokeAuthorization() public {
        uint256 id = _mint(alice);
        vm.startPrank(alice);
        nft.authorizeUsage(id, bob);
        nft.revokeAuthorization(id, bob);
        vm.stopPrank();
        assertEq(nft.authorizedUsersOf(id).length, 0);
    }

    function test_RevertAuthorizeNotOwner() public {
        uint256 id = _mint(alice);
        vm.prank(bob);
        vm.expectRevert(FlageAgentNFT.NotAuthorized.selector);
        nft.authorizeUsage(id, charlie);
    }

    // -------------------------------------------------------------------------
    // approve / isApprovedForAll
    // -------------------------------------------------------------------------

    function test_Approve() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        nft.approve(bob, id);
        assertEq(nft.getApproved(id), bob);
    }

    function test_SetApprovalForAll() public {
        vm.prank(alice);
        nft.setApprovalForAll(bob, true);
        assertTrue(nft.isApprovedForAll(alice, bob));
    }

    function test_RevertApproveNotOwnerOrOperator() public {
        uint256 id = _mint(alice);
        vm.prank(bob);
        vm.expectRevert(FlageAgentNFT.NotAuthorized.selector);
        nft.approve(charlie, id);
    }

    function test_OperatorCanApprove() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        nft.setApprovalForAll(bob, true);
        vm.prank(bob);
        nft.approve(charlie, id);
        assertEq(nft.getApproved(id), charlie);
    }

    // -------------------------------------------------------------------------
    // delegateAccess
    // -------------------------------------------------------------------------

    function test_DelegateAccess() public {
        vm.prank(alice);
        nft.delegateAccess(bob);
        assertEq(nft.getDelegateAccess(alice), bob);
    }

    // -------------------------------------------------------------------------
    // iTransfer
    // -------------------------------------------------------------------------

    function test_ITransferByOwner() public {
        uint256 id = _mint(alice);
        _iTransfer(alice, bob, id);
        assertEq(nft.ownerOf(id), bob);
    }

    function test_ITransferByApproved() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        nft.approve(bob, id);
        _iTransfer(bob, charlie, id);
        assertEq(nft.ownerOf(id), charlie);
    }

    function test_ITransferByOperator() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        nft.setApprovalForAll(bob, true);
        _iTransfer(bob, charlie, id);
        assertEq(nft.ownerOf(id), charlie);
    }

    function test_ITransferClearsApproval() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        nft.approve(bob, id);
        _iTransfer(alice, charlie, id);
        assertEq(nft.getApproved(id), address(0));
    }

    function test_RevertITransferNotAuthorized() public {
        uint256 id = _mint(alice);
        vm.expectRevert(FlageAgentNFT.NotAuthorized.selector);
        _iTransfer(bob, charlie, id);
    }

    function test_RevertITransferToZero() public {
        uint256 id = _mint(alice);
        IERC7857DataVerifier.TransferValidityProof[] memory proofs = _emptyProofs();
        vm.prank(alice);
        vm.expectRevert(FlageAgentNFT.ZeroAddress.selector);
        nft.iTransfer(address(0), id, proofs);
    }

    // -------------------------------------------------------------------------
    // iClone
    // -------------------------------------------------------------------------

    function test_IClone() public {
        uint256 id = _mint(alice);
        uint256 newId = _iClone(alice, bob, id);
        assertEq(nft.ownerOf(id), alice); // original unchanged
        assertEq(nft.ownerOf(newId), bob);
        assertEq(newId, 1);
    }

    function test_RevertICloneNotOwner() public {
        uint256 id = _mint(alice);
        vm.expectRevert(FlageAgentNFT.NotAuthorized.selector);
        _iClone(bob, charlie, id);
    }

    // -------------------------------------------------------------------------
    // name / symbol / verifier
    // -------------------------------------------------------------------------

    function test_Metadata() public view {
        assertEq(nft.name(), "Flage Agent");
        assertEq(nft.symbol(), "FLAGE");
        assertEq(address(nft.verifier()), address(verifier));
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _mint(address to) internal returns (uint256) {
        IERC7857Metadata.IntelligentData[] memory data = new IERC7857Metadata.IntelligentData[](0);
        bytes[] memory keys = new bytes[](0);
        vm.prank(protocol);
        return nft.mint(to, data, keys);
    }

    function _mintWithData(address to) internal returns (uint256) {
        IERC7857Metadata.IntelligentData[] memory data = new IERC7857Metadata.IntelligentData[](1);
        data[0] = IERC7857Metadata.IntelligentData({
            dataDescription: "model-weights-v1",
            dataHash: bytes32(uint256(0xABCD))
        });
        bytes[] memory keys = new bytes[](1);
        keys[0] = hex"deadbeef";
        vm.prank(protocol);
        return nft.mint(to, data, keys);
    }

    function _emptyProofs()
        internal
        pure
        returns (IERC7857DataVerifier.TransferValidityProof[] memory)
    {
        return new IERC7857DataVerifier.TransferValidityProof[](0);
    }

    function _buildProof(bytes32 oldHash, bytes32 newHash)
        internal
        pure
        returns (IERC7857DataVerifier.TransferValidityProof[] memory proofs)
    {
        proofs = new IERC7857DataVerifier.TransferValidityProof[](1);
        proofs[0].accessProof = IERC7857DataVerifier.AccessProof({
            oldDataHash: oldHash,
            newDataHash: newHash,
            nonce: hex"01",
            encryptedPubKey: hex"aabb",
            proof: hex""
        });
        proofs[0].ownershipProof = IERC7857DataVerifier.OwnershipProof({
            oracleType: IERC7857DataVerifier.OracleType.TEE,
            oldDataHash: oldHash,
            newDataHash: newHash,
            sealedKey: hex"ccdd",
            encryptedPubKey: hex"aabb",
            nonce: hex"01",
            proof: hex""
        });
    }

    function _iTransfer(address caller, address to, uint256 id) internal {
        IERC7857DataVerifier.TransferValidityProof[] memory proofs = _emptyProofs();
        vm.prank(caller);
        nft.iTransfer(to, id, proofs);
    }

    function _iClone(address caller, address to, uint256 id) internal returns (uint256) {
        IERC7857DataVerifier.TransferValidityProof[] memory proofs = _emptyProofs();
        vm.prank(caller);
        return nft.iClone(to, id, proofs);
    }
}
