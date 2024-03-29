// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright Fathom 2023

pragma solidity 0.8.19;

interface IFactory {
    function updateVaultPackage(address _vaultPackage) external;

    function updateFeeConfig(address _feeRecipient, uint16 _feeBPS) external;

    function deployVault(
        uint32 _profitMaxUnlockTime,
        address _asset,
        string calldata _name,
        string calldata _symbol,
        address _accountant,
        address _admin
    ) external returns (address);

    function getVaults() external view returns (address[] memory);

    function getVaultCreator(address _vault) external view returns (address);

    function protocolFeeConfig() external view returns (uint16 /*feeBps*/, address /*feeRecipient*/);
}
