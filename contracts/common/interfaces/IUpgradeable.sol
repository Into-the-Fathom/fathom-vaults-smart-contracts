// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright Fathom 2023

pragma solidity 0.8.19;

interface IUpgradeable {
    function setImplementation(address implementation, bytes memory _data) external;
}
