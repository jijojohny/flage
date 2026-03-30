// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MockERC20.sol";

/// @dev Minimal Curve pool stub. exchange() returns 1:1 by default.
contract MockCurvePool {
    address[2] public coins_;
    bool public shouldRevert;

    constructor(address coin0, address coin1) {
        coins_[0] = coin0;
        coins_[1] = coin1;
    }

    function setRevert(bool _revert) external { shouldRevert = _revert; }

    function coins(uint256 i) external view returns (address) {
        return coins_[i];
    }

    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256) {
        if (shouldRevert) revert("MockCurve: forced revert");

        address tokenIn = coins_[uint256(uint128(i))];
        address tokenOut = coins_[uint256(uint128(j))];

        MockERC20(tokenIn).transferFrom(msg.sender, address(this), dx);

        uint256 out = dx; // 1:1
        require(out >= min_dy, "MockCurve: slippage");
        MockERC20(tokenOut).mint(msg.sender, out);
        return out;
    }
}
