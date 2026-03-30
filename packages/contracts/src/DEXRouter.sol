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

/// @dev Curve-style pool: exchange(i, j, dx, min_dy)
interface ICurvePool {
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256);
    function coins(uint256 i) external view returns (address);
}

/// @dev Flash loan provider interface (Aave V3 style)
interface IFlashLoanProvider {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

interface IFlashLoanReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

/// @title DEXRouter
/// @notice Routes trades to integrated DEXs on behalf of FlageVault.
///         Supports UniswapV3-style (dexType=0), Curve-style (dexType=1),
///         and flash-loan arbitrage (triggered separately via flashArb).
contract DEXRouter is IFlashLoanReceiver {
    using SafeERC20 for IERC20;

    struct DEXConfig {
        address router;
        uint8 dexType;       // 0=UniV3, 1=Curve, 2=Custom
        uint24 defaultFee;   // UniV3 fee tier
        int128 curveIndexIn; // Curve coin index for tokenIn
        int128 curveIndexOut;// Curve coin index for tokenOut
        bool active;
    }

    // In-flight flash loan params (re-entrancy safe: cleared before external call completes)
    struct FlashArbParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minProfit;
        bytes32 pairHash;
    }

    address public vault;
    address public owner;
    address public flashLoanProvider; // Aave V3 style

    // pairHash => ordered list of DEX configs to try
    mapping(bytes32 => DEXConfig[]) public dexConfigs;

    event SwapExecuted(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event DEXConfigured(bytes32 indexed pair, address router, uint8 dexType);
    event FlashArbExecuted(address tokenIn, address tokenOut, uint256 amountIn, uint256 profit);

    error NotVault();
    error NotOwner();
    error NoActiveDEX();
    error SwapFailed();
    error Expired();
    error NotFlashLoanProvider();
    error InsufficientProfit();

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _flashLoanProvider) {
        owner = msg.sender;
        flashLoanProvider = _flashLoanProvider; // address(0) = disabled
    }

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    function setOwner(address _owner) external onlyOwner {
        owner = _owner;
    }

    function setFlashLoanProvider(address _provider) external onlyOwner {
        flashLoanProvider = _provider;
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
            } else if (config.dexType == 1) {
                // Curve-style
                amountOut = _swapCurve(
                    config.router,
                    config.curveIndexIn,
                    config.curveIndexOut,
                    amountIn,
                    priceLimit
                );
            }
            // dexType == 2: custom adapters extend this contract

            if (amountOut > 0) {
                emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
                return amountOut;
            }
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

    function _swapCurve(
        address pool,
        int128 indexIn,
        int128 indexOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        // Pull tokens from vault
        address tokenIn = ICurvePool(pool).coins(uint256(uint128(indexIn)));
        IERC20(tokenIn).safeTransferFrom(vault, address(this), amountIn);
        IERC20(tokenIn).safeIncreaseAllowance(pool, amountIn);

        try ICurvePool(pool).exchange(indexIn, indexOut, amountIn, minAmountOut) returns (uint256 out) {
            amountOut = out;
            // Transfer output tokens back to vault
            address tokenOut = ICurvePool(pool).coins(uint256(uint128(indexOut)));
            IERC20(tokenOut).safeTransfer(vault, amountOut);
        } catch {
            // Revoke allowance, return tokens, signal failure
            IERC20(tokenIn).safeDecreaseAllowance(pool, amountIn);
            IERC20(tokenIn).safeTransfer(vault, amountIn);
            amountOut = 0;
        }
    }

    // --- Flash Loan Arbitrage ---

    /// @notice Execute a flash-loan funded arbitrage between two routes on the same pair.
    ///         Borrows `amountIn` of tokenIn, executes the swap through configured DEXs,
    ///         repays loan + premium, and sends profit to vault.
    ///         Only callable by vault (i.e. triggered by a TEE PoI-signed trade).
    function flashArb(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minProfit
    ) external onlyVault {
        require(flashLoanProvider != address(0), "DEXRouter: no flash provider");

        bytes32 pairHash = keccak256(abi.encodePacked(tokenIn, tokenOut));

        bytes memory params = abi.encode(FlashArbParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minProfit: minProfit,
            pairHash: pairHash
        }));

        IFlashLoanProvider(flashLoanProvider).flashLoanSimple(
            address(this),
            tokenIn,
            amountIn,
            params,
            0
        );
    }

    /// @inheritdoc IFlashLoanReceiver
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        if (msg.sender != flashLoanProvider) revert NotFlashLoanProvider();
        if (initiator != address(this)) revert NotFlashLoanProvider();

        FlashArbParams memory p = abi.decode(params, (FlashArbParams));

        // Approve DEX to spend flash-loaned tokens (held by this contract)
        IERC20(asset).safeIncreaseAllowance(address(this), amount);

        // Execute the swap directly (tokens already in this contract from flash loan)
        // We bypass the vault-pull logic by routing through internal swap
        DEXConfig[] storage configs = dexConfigs[p.pairHash];
        uint256 amountOut;
        for (uint256 i = 0; i < configs.length; i++) {
            DEXConfig memory config = configs[i];
            if (!config.active) continue;

            if (config.dexType == 0) {
                IERC20(asset).safeIncreaseAllowance(config.router, amount);
                try IUniswapV3Router(config.router).exactInputSingle(
                    IUniswapV3Router.ExactInputSingleParams({
                        tokenIn: asset,
                        tokenOut: p.tokenOut,
                        fee: config.defaultFee,
                        recipient: address(this),
                        amountIn: amount,
                        amountOutMinimum: 0,
                        sqrtPriceLimitX96: 0
                    })
                ) returns (uint256 out) {
                    amountOut = out;
                    break;
                } catch {
                    IERC20(asset).safeDecreaseAllowance(config.router, amount);
                }
            } else if (config.dexType == 1) {
                IERC20(asset).safeIncreaseAllowance(config.router, amount);
                try ICurvePool(config.router).exchange(
                    config.curveIndexIn, config.curveIndexOut, amount, 0
                ) returns (uint256 out) {
                    amountOut = out;
                    break;
                } catch {
                    IERC20(asset).safeDecreaseAllowance(config.router, amount);
                }
            }
        }

        uint256 repayAmount = amount + premium;
        // Profit check: we need enough tokenIn back (after converting tokenOut) OR
        // the arbitrage leaves us with surplus tokenIn after repayment.
        // Simple check: amountOut (in tokenOut) must cover minProfit after back-conversion.
        // For same-token arb (tokenIn==tokenOut), this is direct.
        if (p.tokenIn == p.tokenOut) {
            if (amountOut < repayAmount + p.minProfit) revert InsufficientProfit();
            IERC20(asset).safeIncreaseAllowance(flashLoanProvider, repayAmount);
            uint256 profit = amountOut - repayAmount;
            IERC20(asset).safeTransfer(vault, profit);
            emit FlashArbExecuted(p.tokenIn, p.tokenOut, amount, profit);
        } else {
            // Cross-asset: repay loan in tokenIn, transfer tokenOut profit to vault
            IERC20(asset).safeIncreaseAllowance(flashLoanProvider, repayAmount);
            if (amountOut < p.minProfit) revert InsufficientProfit();
            IERC20(p.tokenOut).safeTransfer(vault, amountOut);
            emit FlashArbExecuted(p.tokenIn, p.tokenOut, amount, amountOut);
        }

        return true;
    }

    // --- Configuration ---

    function addDEXConfig(
        bytes32 pairHash,
        address router,
        uint8 dexType,
        uint24 defaultFee,
        int128 curveIndexIn,
        int128 curveIndexOut
    ) external onlyOwner {
        dexConfigs[pairHash].push(DEXConfig({
            router: router,
            dexType: dexType,
            defaultFee: defaultFee,
            curveIndexIn: curveIndexIn,
            curveIndexOut: curveIndexOut,
            active: true
        }));
        emit DEXConfigured(pairHash, router, dexType);
    }

    function deactivateDEX(bytes32 pairHash, uint256 index) external onlyOwner {
        dexConfigs[pairHash][index].active = false;
    }
}
