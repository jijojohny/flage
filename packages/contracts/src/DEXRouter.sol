// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params)
        external returns (uint256 amountOut);
}

/// @title DEXRouter
/// @notice Routes trades to integrated DEXs on behalf of FlageVault
contract DEXRouter {
    using SafeERC20 for IERC20;

    struct DEXConfig {
        address router;
        uint8 dexType;      // 0=UniV3, 1=Curve, 2=Custom
        uint24 defaultFee;  // UniV3 fee tier
        bool active;
    }

    address public vault;
    address public owner;

    // pairHash => ordered list of DEX configs to try
    mapping(bytes32 => DEXConfig[]) public dexConfigs;

    event SwapExecuted(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event DEXConfigured(bytes32 indexed pair, address router, uint8 dexType);

    error NotVault();
    error NotOwner();
    error NoActiveDEX();
    error SwapFailed();
    error Expired();

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    function setOwner(address _owner) external onlyOwner {
        owner = _owner;
    }

    /// @notice Execute a swap — called by FlageVault after PoI verification
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 priceLimit,
        uint256 deadline
    ) external onlyVault returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert Expired();

        bytes32 pairHash = keccak256(abi.encodePacked(tokenIn, tokenOut));
        DEXConfig[] storage configs = dexConfigs[pairHash];

        // Try each configured DEX in order
        for (uint256 i = 0; i < configs.length; i++) {
            DEXConfig memory config = configs[i];
            if (!config.active) continue;

            if (config.dexType == 0) {
                // UniswapV3-style
                amountOut = _swapUniV3(
                    config.router,
                    tokenIn,
                    tokenOut,
                    config.defaultFee,
                    amountIn,
                    priceLimit,
                    deadline
                );
                if (amountOut > 0) {
                    emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
                    return amountOut;
                }
            }
            // Additional dexType cases can be added here
        }

        revert NoActiveDEX();
    }

    function _swapUniV3(
        address router,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 priceLimit,
        uint256 deadline
    ) internal returns (uint256 amountOut) {
        // Pull tokens from vault
        IERC20(tokenIn).safeTransferFrom(vault, address(this), amountIn);
        IERC20(tokenIn).safeIncreaseAllowance(router, amountIn);

        try IUniswapV3Router(router).exactInputSingle(
            IUniswapV3Router.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: vault,
                amountIn: amountIn,
                amountOutMinimum: priceLimit,
                sqrtPriceLimitX96: 0
            })
        ) returns (uint256 out) {
            amountOut = out;
        } catch {
            // Revoke allowance and return 0 to try next DEX
            IERC20(tokenIn).safeDecreaseAllowance(router, amountIn);
            IERC20(tokenIn).safeTransfer(vault, amountIn);
            amountOut = 0;
        }
    }

    // --- Configuration ---

    function addDEXConfig(
        bytes32 pairHash,
        address router,
        uint8 dexType,
        uint24 defaultFee
    ) external onlyOwner {
        dexConfigs[pairHash].push(DEXConfig({
            router: router,
            dexType: dexType,
            defaultFee: defaultFee,
            active: true
        }));
        emit DEXConfigured(pairHash, router, dexType);
    }

    function deactivateDEX(bytes32 pairHash, uint256 index) external onlyOwner {
        dexConfigs[pairHash][index].active = false;
    }
}
