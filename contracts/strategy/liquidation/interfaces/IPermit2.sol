// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}
