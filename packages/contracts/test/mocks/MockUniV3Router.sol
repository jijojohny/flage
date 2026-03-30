// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/DEXRouter.sol";
import "./MockERC20.sol";

/// @dev Simulates a UniV3 router. Returns 1:1 swaps; can be configured to revert.
contract MockUniV3Router {
    bool public shouldRevert;
    uint256 public slippage; // basis points of loss (0 = 1:1, 100 = 1% loss)

    function setRevert(bool _revert) external { shouldRevert = _revert; }
    function setSlippage(uint256 bps) external { slippage = bps; }

    function exactInputSingle(
        IUniswapV3Router.ExactInputSingleParams calldata params
    ) external returns (uint256 amountOut) {
        if (shouldRevert) revert("MockUniV3: forced revert");

        // Pull tokens
        MockERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);

        // Calculate output with slippage
        amountOut = params.amountIn * (10000 - slippage) / 10000;
        require(amountOut >= params.amountOutMinimum, "MockUniV3: slippage");

        // Mint output tokens to recipient (simulating swap)
        MockERC20(params.tokenOut).mint(params.recipient, amountOut);
    }
}
