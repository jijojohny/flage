// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/DEXRouter.sol";
import "./mocks/MockERC20.sol";
import "./mocks/MockUniV3Router.sol";
import "./mocks/MockCurvePool.sol";

contract DEXRouterTest is Test {
    DEXRouter router;
    MockUniV3Router uniRouter;
    MockCurvePool curvePool;
    MockERC20 tokenA;
    MockERC20 tokenB;

    address owner = address(1);
    address vault = address(2);

    bytes32 pairHash;

    function setUp() public {
        tokenA = new MockERC20("Token A", "TKA", 18);
        tokenB = new MockERC20("Token B", "TKB", 18);

        uniRouter = new MockUniV3Router();
        curvePool = new MockCurvePool(address(tokenA), address(tokenB));

        vm.prank(owner);
        router = new DEXRouter(address(0)); // no flash provider

        vm.startPrank(owner);
        router.setVault(vault);
        vm.stopPrank();

        pairHash = keccak256(abi.encodePacked(address(tokenA), address(tokenB)));

        // Seed vault with tokenA
        tokenA.mint(vault, 1000 ether);
        // Pre-approve router to pull from vault
        vm.prank(vault);
        tokenA.approve(address(router), type(uint256).max);
    }

    // -------------------------------------------------------------------------
    // addDEXConfig
    // -------------------------------------------------------------------------

    function test_AddDEXConfigUniV3() public {
        vm.prank(owner);
        router.addDEXConfig(pairHash, address(uniRouter), 0, 3000, 0, 0);

        (address r,,,, bool active) = _getFirstConfig();
        assertEq(r, address(uniRouter));
        assertTrue(active);
    }

    function test_AddDEXConfigCurve() public {
        vm.prank(owner);
        router.addDEXConfig(pairHash, address(curvePool), 1, 0, 0, 1);

        (, uint8 dexType,,,) = _getFirstConfig();
        assertEq(dexType, 1);
    }

    function test_RevertAddDEXConfigNotOwner() public {
        vm.expectRevert(DEXRouter.NotOwner.selector);
        router.addDEXConfig(pairHash, address(uniRouter), 0, 3000, 0, 0);
    }

    // -------------------------------------------------------------------------
    // swap — UniV3
    // -------------------------------------------------------------------------

    function test_SwapUniV3Success() public {
        vm.prank(owner);
        router.addDEXConfig(pairHash, address(uniRouter), 0, 3000, 0, 0);

        vm.prank(vault);
        uint256 amountOut = router.swap(
            address(tokenA), address(tokenB), 10 ether, 0, block.timestamp + 60
        );
        assertEq(amountOut, 10 ether); // 1:1 mock
    }

    function test_SwapUniV3FallsThruOnRevert() public {
        // First config reverts, second succeeds
        uniRouter.setRevert(true);
        MockUniV3Router uniRouter2 = new MockUniV3Router();

        vm.startPrank(owner);
        router.addDEXConfig(pairHash, address(uniRouter), 0, 3000, 0, 0);  // will fail
        router.addDEXConfig(pairHash, address(uniRouter2), 0, 3000, 0, 0); // will succeed
        vm.stopPrank();

        vm.prank(vault);
        uint256 amountOut = router.swap(
            address(tokenA), address(tokenB), 5 ether, 0, block.timestamp + 60
        );
        assertEq(amountOut, 5 ether);
    }

    function test_RevertSwapNoActiveDEX() public {
        // No config added
        vm.prank(vault);
        vm.expectRevert(DEXRouter.NoActiveDEX.selector);
        router.swap(address(tokenA), address(tokenB), 1 ether, 0, block.timestamp + 60);
    }

    function test_RevertSwapExpired() public {
        vm.prank(owner);
        router.addDEXConfig(pairHash, address(uniRouter), 0, 3000, 0, 0);

        vm.warp(block.timestamp + 100);

        vm.prank(vault);
        vm.expectRevert(DEXRouter.Expired.selector);
        router.swap(address(tokenA), address(tokenB), 1 ether, 0, block.timestamp - 1);
    }

    function test_RevertSwapNotVault() public {
        vm.prank(owner);
        router.addDEXConfig(pairHash, address(uniRouter), 0, 3000, 0, 0);

        vm.expectRevert(DEXRouter.NotVault.selector);
        router.swap(address(tokenA), address(tokenB), 1 ether, 0, block.timestamp + 60);
    }

    // -------------------------------------------------------------------------
    // swap — Curve
    // -------------------------------------------------------------------------

    function test_SwapCurveSuccess() public {
        vm.prank(owner);
        // curveIndexIn=0 (tokenA), curveIndexOut=1 (tokenB)
        router.addDEXConfig(pairHash, address(curvePool), 1, 0, 0, 1);

        vm.prank(vault);
        uint256 amountOut = router.swap(
            address(tokenA), address(tokenB), 7 ether, 0, block.timestamp + 60
        );
        assertEq(amountOut, 7 ether);
        // tokenB should have arrived in vault
        assertEq(tokenB.balanceOf(vault), 7 ether);
    }

    function test_SwapCurveFallsThruOnRevert() public {
        curvePool.setRevert(true);
        MockUniV3Router fallback = new MockUniV3Router();

        vm.startPrank(owner);
        router.addDEXConfig(pairHash, address(curvePool), 1, 0, 0, 1); // fails
        router.addDEXConfig(pairHash, address(fallback), 0, 3000, 0, 0); // succeeds
        vm.stopPrank();

        vm.prank(vault);
        uint256 amountOut = router.swap(
            address(tokenA), address(tokenB), 3 ether, 0, block.timestamp + 60
        );
        assertEq(amountOut, 3 ether);
    }

    // -------------------------------------------------------------------------
    // deactivateDEX
    // -------------------------------------------------------------------------

    function test_DeactivateDEX() public {
        vm.prank(owner);
        router.addDEXConfig(pairHash, address(uniRouter), 0, 3000, 0, 0);

        vm.prank(owner);
        router.deactivateDEX(pairHash, 0);

        vm.prank(vault);
        vm.expectRevert(DEXRouter.NoActiveDEX.selector);
        router.swap(address(tokenA), address(tokenB), 1 ether, 0, block.timestamp + 60);
    }

    // -------------------------------------------------------------------------
    // setOwner
    // -------------------------------------------------------------------------

    function test_SetOwner() public {
        address newOwner = address(99);
        vm.prank(owner);
        router.setOwner(newOwner);
        assertEq(router.owner(), newOwner);
    }

    // -------------------------------------------------------------------------
    // Fuzz
    // -------------------------------------------------------------------------

    function testFuzz_SwapAmounts(uint256 amount) public {
        amount = bound(amount, 1, 1000 ether);
        tokenA.mint(vault, amount);

        vm.prank(owner);
        router.addDEXConfig(pairHash, address(uniRouter), 0, 3000, 0, 0);

        vm.prank(vault);
        uint256 amountOut = router.swap(
            address(tokenA), address(tokenB), amount, 0, block.timestamp + 60
        );
        assertEq(amountOut, amount);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _getFirstConfig()
        internal
        view
        returns (address r, uint8 dexType, uint24 defaultFee, bool active_, bool active)
    {
        DEXRouter.DEXConfig memory cfg;
        (cfg.router, cfg.dexType, cfg.defaultFee, cfg.curveIndexIn, cfg.active) =
            _unpack(pairHash, 0);
        return (cfg.router, cfg.dexType, cfg.defaultFee, cfg.active, cfg.active);
    }

    function _unpack(bytes32 ph, uint256 idx)
        internal
        view
        returns (address r, uint8 dt, uint24 df, int128 ci, bool active)
    {
        (r, dt, df, ci,, active) = _readConfig(ph, idx);
    }

    function _readConfig(bytes32 ph, uint256 idx)
        internal
        view
        returns (address r, uint8 dt, uint24 df, int128 ci, int128 co, bool active)
    {
        // dexConfigs is public mapping(bytes32 => DEXConfig[]) — access element via Solidity getter
        // Foundry exposes public struct arrays; read via abi.decode of staticcall
        (bool ok, bytes memory data) = address(router).staticcall(
            abi.encodeWithSignature("dexConfigs(bytes32,uint256)", ph, idx)
        );
        require(ok, "dexConfigs call failed");
        (r, dt, df, ci, co, active) = abi.decode(data, (address, uint8, uint24, int128, int128, bool));
    }
}
