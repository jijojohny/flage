// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FlageVault.sol";
import "../src/DEXRouter.sol";
import "./mocks/MockERC20.sol";

contract MockDEXRouter {
    address public vault;

    function setVault(address _vault) external { vault = _vault; }

    function swap(
        address,
        address,
        uint256 amountIn,
        uint256,
        uint256
    ) external returns (uint256) {
        return amountIn;
    }
}

contract FlageVaultTest is Test {
    FlageVault vault;
    MockDEXRouter router;
    MockERC20 tokenA;
    MockERC20 tokenB;

    address owner = address(1);
    uint256 teePrivKey = 0xDEADBEEF;
    address teeSigner;

    bytes32 constant PAIR = keccak256("ETH/USDC");

    function setUp() public {
        router = new MockDEXRouter();
        vm.prank(owner);
        vault = new FlageVault(address(router));
        router.setVault(address(vault));

        tokenA = new MockERC20("Token A", "TKA", 18);
        tokenB = new MockERC20("Token B", "TKB", 6);

        teeSigner = vm.addr(teePrivKey);

        // Setup: register TEE, configure pair, whitelist tokens, deposit capital
        vm.startPrank(owner);
        vault.registerTEE(teeSigner, bytes32(0), bytes32(0));
        vault.whitelistToken(address(tokenA));
        vault.whitelistToken(address(tokenB));
        vault.configurePair(
            PAIR,
            address(tokenA),
            address(tokenB),
            100 ether,       // max position
            1000 ether       // max daily volume
        );
        vm.stopPrank();

        // Seed vault with tokens
        tokenA.mint(address(vault), 1000 ether);
        tokenB.mint(address(vault), 1_000_000e6);
    }

    function _buildAndSign(
        uint8 action,
        uint256 amount,
        uint256 nonce
    ) internal view returns (FlageVault.TradePayload memory payload, bytes memory sig) {
        payload = FlageVault.TradePayload({
            action: action,
            pair: PAIR,
            amount: amount,
            priceLimit: 3000 ether,
            deadline: block.timestamp + 60,
            nonce: nonce,
            vault: address(vault)
        });

        bytes32 payloadHash = keccak256(abi.encodePacked(
            payload.action, payload.pair, payload.amount,
            payload.priceLimit, payload.deadline, payload.nonce, payload.vault
        ));
        bytes32 ethSignedHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32", payloadHash
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teePrivKey, ethSignedHash);
        sig = abi.encodePacked(r, s, v);
    }

    function test_ExecuteBuyTrade() public {
        (FlageVault.TradePayload memory payload, bytes memory sig) = _buildAndSign(0, 1 ether, 0);
        vault.executeTrade(payload, sig);
        assertEq(vault.totalTrades(), 1);
    }

    function test_ExecuteSellTrade() public {
        (FlageVault.TradePayload memory payload, bytes memory sig) = _buildAndSign(1, 1 ether, 0);
        vault.executeTrade(payload, sig);
        assertEq(vault.totalTrades(), 1);
    }

    function test_RevertOnExpiredTrade() public {
        (FlageVault.TradePayload memory payload, bytes memory sig) = _buildAndSign(0, 1 ether, 0);
        vm.warp(block.timestamp + 120);
        vm.expectRevert(FlageVault.TradeExpired.selector);
        vault.executeTrade(payload, sig);
    }

    function test_RevertOnDuplicateNonce() public {
        (FlageVault.TradePayload memory payload, bytes memory sig) = _buildAndSign(0, 1 ether, 0);
        vault.executeTrade(payload, sig);

        // Attempt replay with same nonce
        (payload, sig) = _buildAndSign(0, 1 ether, 0);
        vm.expectRevert(FlageVault.NonceUsed.selector);
        vault.executeTrade(payload, sig);
    }

    function test_RevertOnInvalidSigner() public {
        uint256 badKey = 0xBADBAD;
        FlageVault.TradePayload memory payload = FlageVault.TradePayload({
            action: 0,
            pair: PAIR,
            amount: 1 ether,
            priceLimit: 3000 ether,
            deadline: block.timestamp + 60,
            nonce: 0,
            vault: address(vault)
        });
        bytes32 ph = keccak256(abi.encodePacked(
            payload.action, payload.pair, payload.amount,
            payload.priceLimit, payload.deadline, payload.nonce, payload.vault
        ));
        bytes32 esh = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", ph));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(badKey, esh);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.expectRevert(FlageVault.TEENotRegistered.selector);
        vault.executeTrade(payload, sig);
    }

    function test_RevertOnExceedingPositionSize() public {
        (FlageVault.TradePayload memory payload, bytes memory sig) = _buildAndSign(
            0, 200 ether, 0  // exceeds maxPositionSize of 100 ether
        );
        vm.expectRevert(FlageVault.ExceedsPositionLimit.selector);
        vault.executeTrade(payload, sig);
    }

    function testFuzz_MultipleTradesIncrementNonce(uint8 numTrades) public {
        numTrades = uint8(bound(numTrades, 1, 20));
        for (uint8 i = 0; i < numTrades; i++) {
            (FlageVault.TradePayload memory p, bytes memory s) = _buildAndSign(0, 1 ether, i);
            vault.executeTrade(p, s);
        }
        assertEq(vault.totalTrades(), numTrades);
    }
}
