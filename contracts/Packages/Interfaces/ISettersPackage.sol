// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

interface ISettersPackage {
    function initialize(address _sharesManager) external;

    function setAccountant(address newAccountant) external;

    function setDefaultQueue(address[] calldata newDefaultQueue) external;

    function setUseDefaultQueue(bool _useDefaultQueue) external;

    function setDepositLimit(uint256 _depositLimit) external;

    function setDepositLimitModule(address _depositLimitModule) external;

    function setWithdrawLimitModule(address _withdrawLimitModule) external;

    function setMinimumTotalIdle(uint256 _minimumTotalIdle) external;

    function setProfitMaxUnlockTime(uint256 _newProfitMaxUnlockTime) external;
}
