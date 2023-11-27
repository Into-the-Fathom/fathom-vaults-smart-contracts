const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
    time
  } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

async function userDeposit(user, vault, token, amount) {
    await token.mint(user.address, amount);
    const initialBalance = await token.balanceOf(vault.target);
    const allowance = await token.allowance(user.address, vault.target);
    
    if (allowance < amount) {
        const approveTx = await token.connect(user).approve(vault.target, ethers.MaxUint256);
        await approveTx.wait(); // Wait for the transaction to be mined
    }
    
    const depositTx = await vault.connect(user).deposit(amount, user.address);
    await depositTx.wait(); // Wait for the transaction to be mined
    
    const finalBalance = await token.balanceOf(vault.target);
    amount = ethers.toBigInt(amount);
    expect(finalBalance).to.equal(initialBalance + amount);

    return depositTx;
}

async function checkVaultEmpty(vault) {
    expect(await vault.totalAssets()).to.equal(0);
    expect(await vault.totalSupplyAmount()).to.equal(0);
    expect(await vault.totalIdleAmount()).to.equal(0);
    expect(await vault.totalDebtAmount()).to.equal(0);
}

async function createProfit(asset, strategy, owner, vault, profit, totalFees, totalRefunds, byPassFees) {
    // We create a virtual profit
    const initialDebt = await vault.strategies(strategy.target).currentDebt;

    await asset.connect(owner).transfer(strategy.target, profit);
    await strategy.connect(owner).report();
    const tx = await vault.connect(owner).processReport(strategy.target);
    console.log("we reached here");

    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === 'StrategyReported');
    const totalFeesReported = event.args.totalFees;

    return totalFeesReported;
}


async function createStrategy(owner, vault) {
    const Strategy = await ethers.getContractFactory("MockTokenizedStrategy");
    const strategy = await Strategy.deploy(await vault.ASSET(), "Mock Tokenized Strategy", owner.address, owner.address, { gasLimit: "0x1000000" });

    return strategy;
}

async function addStrategyToVault(owner, strategy, vault, strategyManager) {
    await expect(vault.connect(owner).addStrategy(strategy.target))
        .to.emit(strategyManager, 'StrategyChanged')
        .withArgs(strategy.target, 0);

    // Access the mapping with the strategy's address as the key
    const strategyParams = await strategyManager.strategies(strategy.target);

    console.log("Activation Timestamp:", strategyParams.activation.toString());
    console.log("Last Report Timestamp:", strategyParams.lastReport.toString());
    console.log("Current Debt:", strategyParams.currentDebt.toString());
    console.log("Max Debt:", strategyParams.maxDebt.toString());

    await strategy.connect(owner).setMaxDebt(ethers.MaxUint256);

    return strategyParams;
}

async function addDebtToStrategy(owner, strategy, vault, debt, strategyManager, strategyParams) {
    const totalIdle = await vault.connect(owner).totalIdleAmount();
    const minimumTotalIdle = await vault.connect(owner).minimumTotalIdle();
    console.log(totalIdle);
    console.log(minimumTotalIdle);
    await expect(vault.connect(owner).updateMaxDebtForStrategy(strategy.target, debt))
        .to.emit(strategyManager, 'UpdatedMaxDebtForStrategy')
        .withArgs(vault.target, strategy.target, debt);
    await expect(vault.connect(owner).updateDebt(strategy.target, debt))
        .to.emit(strategyManager, 'DebtUpdated')
        .withArgs(strategy.target, strategyParams.currentDebt, debt);
}

async function initialSetup(asset, vault, owner, debt, amount, strategyManager) {
    await asset.connect(owner).mint(owner.address, amount);
    const strategy = await createStrategy(owner, vault);
    
    // Deposit assets to vault and get strategy ready
    await userDeposit(owner, vault, asset, amount);
    const strategyParams = await addStrategyToVault(owner, strategy, vault, strategyManager);
    await addDebtToStrategy(owner, strategy, vault, debt, strategyManager, strategyParams);

    return strategy;
}

module.exports = { userDeposit, checkVaultEmpty, createProfit, createStrategy, addStrategyToVault, addDebtToStrategy, initialSetup };