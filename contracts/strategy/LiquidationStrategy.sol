// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright Fathom 2023
pragma solidity 0.8.19;

// import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./BaseStrategy.sol";
import "./interfaces/liquidationStrategy/IFlashLendingCallee.sol";
import "./interfaces/liquidationStrategy/IERC165.sol";
import "./interfaces/liquidationStrategy/IGenericTokenAdapter.sol";
import "./interfaces/liquidationStrategy/IUniswapV2Router02.sol";
import "./interfaces/liquidationStrategy/IStablecoinAdapter.sol";
import { IBookKeeper } from "./interfaces/liquidationStrategy/IBookKeeper.sol";
import "./libraries/BytesHelper.sol";

// solhint-disable
contract LiquidationStrategy is BaseStrategy,
//  Pausable, 
ReentrancyGuard, IFlashLendingCallee, IERC165 {
    using SafeERC20 for ERC20;
    using SafeMath for uint256;
    using BytesHelper for *; 
 
    struct LocalVars {
        address liquidatorAddress;
        IGenericTokenAdapter tokenAdapter;
        IUniswapV2Router02 router;
    }

    struct WXDCInfo {
        uint256 WXDCAmount;
        uint256 amountNeededToPayDebt;
        uint256 averagePriceOfWXDC;
    }

    // --- Math ---
    uint256 constant WAD = 10 ** 18;
    uint256 constant RAY = 10 ** 27;

    IStablecoinAdapter public stablecoinAdapter;
    IBookKeeper public bookKeeper;
    address public strategyManager;
    address public fixedSpreadLiquidationStrategy;
    ERC20 public WXDC;
    ERC20 public fathomStablecoin;
    ERC20 public usdToken;
    bool public allowLoss = true;
    WXDCInfo public idleWXDC;

    event LogSetStrategyManager(address indexed _strategyManager);
    event LogSetFixedSpreadLiquidationStrategy(address indexed _fixedSpreadLiquidationStrategy);
    event LogShutdownWithdrawWXDC(address indexed _strategyManager, uint256 _amount);
    event LogAllowLoss(bool _allowLoss);
    event LogSellWXDC(address _token, address[] _path, IUniswapV2Router02 _router, uint256 _amount, uint256 _minAmountOut, uint256 _receivedAmount);
    event LogFlashLiquidationSuccess(
        address indexed liquidatorAddress,
        uint256 indexed debtValueToRepay,
        uint256 indexed collateralAmountToLiquidate,
        uint256 dexAmountOut,
        uint256 stableSwapAmountOut,
        address[] path
    );

    modifier onlyStrategyManager() {
        require(msg.sender == strategyManager, "LiquidationStrategy: only strategy manager");
        _;
    }

    modifier onlyFixedSpreadLiquidationStrategy() {
        require(msg.sender == fixedSpreadLiquidationStrategy, "LiquidationStrategy: only fixed spread liquidation strategy");
        _;
    }

    constructor(
        address _asset,
        string memory _name,
        address _strategyManager,
        address _fixedSpreadLiquidationStrategy,
        address _wrappedXDC,
        address _bookKeeper,
        address _usdToken,
        address _stablecoinAdapter
    ) BaseStrategy(_asset, _name) {
        require(_strategyManager != address(0), "LiquidationStrategy: zero address");
        require(_fixedSpreadLiquidationStrategy != address(0), "LiquidationStrategy: zero address");
        require(_wrappedXDC != address(0), "LiquidationStrategy: zero address");
        require(_bookKeeper != address(0), "LiquidationStrategy: zero address");
        require(_usdToken != address(0), "LiquidationStrategy: zero address");
        require(_stablecoinAdapter != address(0), "LiquidationStrategy: zero address");
        strategyManager = _strategyManager;
        fixedSpreadLiquidationStrategy = _fixedSpreadLiquidationStrategy;
        WXDC = ERC20(_wrappedXDC);
        bookKeeper = IBookKeeper(_bookKeeper);
        stablecoinAdapter = IStablecoinAdapter(_stablecoinAdapter);
        fathomStablecoin = ERC20(_asset);
        usdToken = ERC20(_usdToken);
    }

    function _harvestAndReport() internal view override returns (uint256 _totalAssets) {
        _totalAssets = asset.balanceOf(address(this));
    }

    function availableDepositLimit(address /*_owner*/) public view override returns (uint256) {
        // Return the remaining room.
        return type(uint256).max - asset.balanceOf(address(this));
    }

    function availableWithdrawLimit(address /*_owner*/) public view override returns (uint256) {
        return TokenizedStrategy.totalIdle();
    }

    function shutdownWithdraw(uint256 _amount) external override onlyStrategyManager {
        _emergencyWithdraw(_amount);
    }

    function setStrategyManager(address _strategyManager) external onlyStrategyManager {
        require(_strategyManager != address(0), "LiquidationStrategy: zero address");
        strategyManager = _strategyManager;
        emit LogSetStrategyManager(_strategyManager);
    }

    function setFixedSpreadLiquidationStrategy(address _fixedSpreadLiquidationStrategy) external onlyStrategyManager {
        require(_fixedSpreadLiquidationStrategy != address(0), "LiquidationStrategy: zero address");
        fixedSpreadLiquidationStrategy = _fixedSpreadLiquidationStrategy;
        emit LogSetFixedSpreadLiquidationStrategy(_fixedSpreadLiquidationStrategy);
    }

    function setAllowLoss(bool _allowLoss) external onlyStrategyManager {
        require(_allowLoss != allowLoss, "LiquidationStrategy: same allowLoss");
        allowLoss = _allowLoss;
        emit LogAllowLoss(_allowLoss);
    }

    function shutdownWithdrawWXDC(uint256 _amount) external onlyStrategyManager {
        require(_amount > 0, "LiquidationStrategy: zero amount");
        require(_amount <= idleWXDC.WXDCAmount, "LiquidationStrategy: wrong amount");
        idleWXDC.WXDCAmount = idleWXDC.WXDCAmount - _amount;
        if (idleWXDC.WXDCAmount == 0) {
            idleWXDC.amountNeededToPayDebt = 0;
            idleWXDC.averagePriceOfWXDC = 0;
        }
        WXDC.safeTransfer(strategyManager, _amount);
        emit LogShutdownWithdrawWXDC(strategyManager, _amount);
    }

    function sellWXDC(
        address _token,
        address[] memory _path,
        IUniswapV2Router02 _router,
        uint256 _amount,
        uint256 _minAmountOut
    ) external onlyStrategyManager {
        require(_token != address(0), "LiquidationStrategy: zero address");
        require(_path.length > 0, "LiquidationStrategy: zero path");
        require(address(_router) != address(0), "LiquidationStrategy: zero address");
        require(_amount > 0, "LiquidationStrategy: zero amount");
        require(_amount <= idleWXDC.WXDCAmount, "LiquidationStrategy: wrong amount");

        idleWXDC.WXDCAmount -= _amount;
        if (idleWXDC.WXDCAmount == 0) {
            idleWXDC.amountNeededToPayDebt = 0;
            idleWXDC.averagePriceOfWXDC = 0;
        }
        uint256 receivedAmount = _sellCollateral(_token, _path, _router, _amount, _minAmountOut);
        emit LogSellWXDC(_token, _path, _router, _amount, _minAmountOut, receivedAmount);
    }

    function flashLendingCall(
        address,
        uint256 _debtValueToRepay, // [rad]
        uint256 _collateralAmountToLiquidate, // [wad]
        bytes calldata data
    ) external onlyFixedSpreadLiquidationStrategy
    //  whenNotPaused 
     nonReentrant {
        LocalVars memory _vars;
        (_vars.liquidatorAddress, _vars.tokenAdapter, _vars.router) = abi.decode(data, (address, IGenericTokenAdapter, IUniswapV2Router02));

        // Retrieve collateral token
        uint256 retrievedCollateralAmount = _retrieveCollateral(_vars.tokenAdapter, _collateralAmountToLiquidate);

        uint256 amountNeededToPayDebt = _debtValueToRepay.div(RAY) + 1;

        (address[] memory path, uint256 dexAmountOut) = _computeMostProfitablePath(
            _vars.router,
            _vars.tokenAdapter.collateralToken(),
            _collateralAmountToLiquidate
        );
        
        /*
         * LiquidationStrategy's condition quadrant as of 16th Jan 2024
         *
         * +------------------+--------------------------------------+--------------------------------------+
         * |                  | Sell WXDC to DEX                     | Not Sell WXDC to DEX                 |
         * +------------------+--------------------------------------+--------------------------------------+
         * | Allow Loss       | Sell WXDC and cover the loss         | X                                    |
         * |                  | with FXD reserve in                  |                                      |
         * |                  | LiquidationStrategy                  |                                      |
         * +------------------+--------------------------------------+--------------------------------------+
         * | Not Allow Loss   | Sell only if condition that          | Keep WXDC to LiquidationStrategy     |
         * |                  | dexAmountOut > amountNeededToPayDebt | and deposit from LiquidationStrategy |
         * |                  | and deposit FXD from WXDCSwap        |                                      |
         * +------------------+--------------------------------------+--------------------------------------+
         */

        if (allowLoss == false) {
            // Condition #1 if there is no loss, sell on DEX
            if (dexAmountOut >= amountNeededToPayDebt) {
                // @sangjun I think the below code can be refactored with the else if condition when allowLoss is true
                uint256 fathomStablecoinReceived = _sellCollateral(
                    _vars.tokenAdapter.collateralToken(),
                    path,
                    _vars.router,
                    _collateralAmountToLiquidate,
                    dexAmountOut
                );
                if (fathomStablecoinReceived < amountNeededToPayDebt) {
                    require(fathomStablecoin.balanceOf(address(this)) >= amountNeededToPayDebt, "flashLendingCall: not enough to repay debt");
                }
                emit LogFlashLiquidationSuccess(
                    _vars.liquidatorAddress,
                    _debtValueToRepay,
                    _collateralAmountToLiquidate,
                    dexAmountOut,
                    fathomStablecoinReceived,
                    path
                );
            } else {
                // Condition #2 if there is loss, don't sell on DEX
                require(fathomStablecoin.balanceOf(address(this)) >= amountNeededToPayDebt, "flashLendingCall: not enough to repay debt");
                _depositStablecoin(amountNeededToPayDebt, _vars.liquidatorAddress);
                idleWXDC.WXDCAmount += retrievedCollateralAmount;
                idleWXDC.amountNeededToPayDebt += amountNeededToPayDebt;
                idleWXDC.averagePriceOfWXDC = idleWXDC.amountNeededToPayDebt.mul(WAD).div(idleWXDC.WXDCAmount);
                emit LogFlashLiquidationSuccess(
                    _vars.liquidatorAddress,
                    _debtValueToRepay,
                    _collateralAmountToLiquidate,
                    dexAmountOut,
                    amountNeededToPayDebt,
                    path
                );
            }
        } else {
            // Condition #3 loss is allowed, so if there is loss, make this address pay for the loss.
            uint256 minAmountOut = dexAmountOut < amountNeededToPayDebt ? dexAmountOut : amountNeededToPayDebt;
            //if allowLoss is true, then the LiquidatorStrategy will pay the difference of amountNeededToPayDebt and dexAmountOut
            uint256 fathomStablecoinReceived = _sellCollateral(
                _vars.tokenAdapter.collateralToken(),
                path,
                _vars.router,
                _collateralAmountToLiquidate,
                minAmountOut
            );

            // If we didn't receive enough to repay the debt - send the amount we received
            // and the liquidator will try to pay the difference with its own funds.
            // uint256 fundsUsedFromLiquidator;
            if (fathomStablecoinReceived < amountNeededToPayDebt) {
                require(fathomStablecoin.balanceOf(address(this)) >= amountNeededToPayDebt, "flashLendingCall: not enough to repay debt");
            }
            // Deposit Fathom Stablecoin for liquidatorAddress
            _depositStablecoin(amountNeededToPayDebt, _vars.liquidatorAddress);
            emit LogFlashLiquidationSuccess(
                _vars.liquidatorAddress,
                _debtValueToRepay,
                _collateralAmountToLiquidate,
                dexAmountOut,
                fathomStablecoinReceived,
                path
            );
        }
    }

    //0)make a WXDCInfo struct - done
    // it should have WXDC amount, and the amountNeededToPayDebt as the price of WXDC, last will be the average price of WXDC idle in this contract.
    //1)make a struct variable called IdleWXDC - done
    //2)make a fn that can sell WXDC to DEXes. Maybe one DEX or more. Let's start from just one DEX, FathomSwap. Once swap is done, update WXDC amount to 0, price to 0. average to 0. It is upto strategyManager to decide
    //if selling WXDC at some point is profitable or not - done
    // I guess I can let the StrategyManager call which DEX it wants to sell WXDC by passing the DEX or Router address as an argument. - done
    //3)emergency withdraw of WXDC should then adjust the idle WXDC amount - done

    //I need to make a fn that can sell WXDC to DEXes when it is profitable, but how to know if it is profitable? Need to have some kind of records that can track the
    //Price of WXDC when the WXDC is withdrawn. how? should I just keep track of the _debtValueToRepay along with the WXDc amount?
    //Maybe I can record it in the condition that WXDC is not sold, get the average price of WXDC sitting in this contract.
    //I need to make fn for the fixed spread liquidation strategy to call like flashLendingCall
    //I need to make fn for the strategy manager to be able to sell WXDC to DEXes when it is profitable - done
    //I need to make fn for the strategy manager to be able to withdraw WXDC in emergency - done
    //I need to fn to change FSLS address - done
    // I need a fn to change strategy manager address - done

    // function pause() external onlyStrategyManager {
    //     _pause();
    // }

    // function unpause() external onlyStrategyManager {
    //     _unpause();
    // }
    function _emergencyWithdraw(uint256 _amount) internal override {
        require(_amount > 0, "LiquidationStrategy: zero amount");
        require(_amount <= asset.balanceOf(address(this)), "LiquidationStrategy: wrong amount");
        asset.safeTransfer(strategyManager, _amount);
    }

    function supportsInterface(bytes4 _interfaceId) external pure returns (bool) {
        return type(IFlashLendingCallee).interfaceId == _interfaceId;
    }

    function _depositStablecoin(uint256 _amount, address _liquidatorAddress) internal {
        fathomStablecoin.safeApprove(address(stablecoinAdapter), type(uint).max);
        stablecoinAdapter.deposit(_liquidatorAddress, _amount, abi.encode(0));
        fathomStablecoin.safeApprove(address(stablecoinAdapter), 0);
    }

    function _retrieveCollateral(IGenericTokenAdapter _tokenAdapter, uint256 _amount) internal returns (uint256) {
        bookKeeper.whitelist(address(_tokenAdapter));
        uint256 balanceBefore = WXDC.balanceOf(address(this));
        _tokenAdapter.withdraw(address(this), _amount, abi.encode(0));
        uint256 balanceAfter = WXDC.balanceOf(address(this));
        return balanceAfter.sub(balanceBefore);
    }

    // _computeMostProfitablePath should be upgraded/updated once curvePool launches and DEX pool of USDT/FXD will be drained.
    // an alternative solution can be to involve xSwap, but needs more research.
    // above problem is not the problem for the current implementation(as of 16th of Jan) but possible future issue.
    function _computeMostProfitablePath(
        IUniswapV2Router02 _router,
        address _collateralToken,
        uint256 _collateralAmountToLiquidate
    ) internal view returns (address[] memory, uint256) {
        // DEX (Collateral -> FXD)
        address[] memory path1 = new address[](2);
        path1[0] = _collateralToken;
        path1[1] = address(fathomStablecoin);
        uint256 scenarioOneAmountOut = _getDexAmountOut(_collateralAmountToLiquidate, path1, _router);

        // DEX (Collateral -> USDT) -> DEX (USDT -> FXD)
        address[] memory path2 = new address[](3);
        path2[0] = _collateralToken;
        path2[1] = address(usdToken);
        path2[2] = address(fathomStablecoin);
        uint256 scenarioTwoAmountOut = _getDexAmountOut(_collateralAmountToLiquidate, path2, _router);

        if (scenarioOneAmountOut >= scenarioTwoAmountOut) {
            // DEX (Collateral -> FXD)
            return (path1, scenarioOneAmountOut);
        } else {
            // DEX (Collateral -> USDT) -> DEX (USDT -> FXD)
            return (path2, scenarioTwoAmountOut);
        }
    }

    function _getDexAmountOut(
        uint256 _collateralAmountToLiquidate,
        address[] memory _path,
        IUniswapV2Router02 _router
    ) internal view returns (uint256) {
        uint256[] memory amounts = _router.getAmountsOut(_collateralAmountToLiquidate, _path);
        uint256 amountToReceive = amounts[amounts.length - 1];
        return amountToReceive;
    }

    function _sellCollateral(
        address _token,
        address[] memory _path,
        IUniswapV2Router02 _router,
        uint256 _amount,
        uint256 _minAmountOut
    ) internal returns (uint256 receivedAmount) {
        if (_path.length != 0) {
            ERC20 _tokencoinAddress = ERC20(_path[_path.length - 1]);
            uint256 _tokencoinBalanceBefore = _tokencoinAddress.balanceOf(address(this));

            // Check if enough FXD will be returned from the DEX
            uint256[] memory amounts = _router.getAmountsOut(_amount, _path);

            uint256 amountToReceive = amounts[amounts.length - 1];

            if (amountToReceive < _minAmountOut) {
                revert(
                    string(
                        abi.encodePacked(
                            " collateralReceived : ",
                            string(ERC20(_token).balanceOf(address(this))._uintToASCIIBytes()),
                            " collaterallToSell : ",
                            string(_amount._uintToASCIIBytes()),
                            " amountNeeded : ",
                            string((_minAmountOut)._uintToASCIIBytes()),
                            " actualAmountReceived : ",
                            string(amountToReceive._uintToASCIIBytes()),
                            " output token : ",
                            string(_path[_path.length - 1]._addressToASCIIBytes())
                        )
                    )
                );
            }

            ERC20(_token).safeApprove(address(_router), type(uint).max);
            _router.swapExactTokensForTokens(
                _amount, // xdc
                _minAmountOut, // fxd
                _path,
                address(this),
                block.timestamp + 1000
            );
            ERC20(_token).safeApprove(address(_router), 0);

            uint256 _tokencoinBalanceAfter = ERC20(_tokencoinAddress).balanceOf(address(this));

            receivedAmount = _tokencoinBalanceAfter.sub(_tokencoinBalanceBefore);
        }
    }

    function _deployFunds(uint256 _amount) internal pure override {}

    function _freeFunds(uint256 _amount)  internal pure override {}
}
