// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright Fathom 2023

pragma solidity 0.8.19;

import "./FactoryStorage.sol";
import "../common/interfaces/IUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Proxy.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Upgrade.sol";

/// @title Vault Factory
contract Factory is Proxy, ERC1967Upgrade, IUpgradeable, FactoryStorage {
    /// @dev Initializes the upgradeable proxy with an initial implementation specified by `implementation`.
    ///
    /// If `_data` is nonempty, it's used as data in a delegate call to `implementation`. This will typically be an
    /// encoded function call, and allows initializing the storage of the proxy like a Solidity constructor.
    ///
    /// Requirements:
    ///
    /// - If `data` is empty, `msg.value` must be zero.
    constructor(address implementation, address admin, bytes memory _data) payable {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _upgradeToAndCall(implementation, _data, false);
    }

    function setImplementation(address implementation, bytes calldata _data) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _upgradeToAndCall(implementation, _data, false);
    }

    /// @dev Returns the current implementation address.
    ///
    /// TIP: To get this value clients can read directly from the storage slot shown below (specified by EIP1967) using
    /// the https://eth.wiki/json-rpc/API#eth_getstorageat[`eth_getStorageAt`] RPC call.
    /// `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`
    function _implementation() internal view virtual override returns (address impl) {
        return ERC1967Upgrade._getImplementation();
    }
}
