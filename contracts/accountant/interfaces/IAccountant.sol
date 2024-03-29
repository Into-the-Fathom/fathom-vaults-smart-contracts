// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright Fathom 2023

pragma solidity 0.8.19;

interface IAccountant {
    function report(address strategy, uint256 gain, uint256 loss) external returns (uint256, uint256);
}
