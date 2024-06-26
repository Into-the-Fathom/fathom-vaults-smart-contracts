const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { ethers } = require("hardhat");
const { expect } = require("chai");

// Fixture for deploying a Vault with all dependencies
async function deployVaultThroughFactory() {
    const profitMaxUnlockTime = 30;
    const minAmountToSell = 1000;
    const amount = "1000";

    const vaultName = 'Vault Shares FXD';
    const vaultSymbol = 'vFXD';
    const [deployer, manager, otherAccount] = await ethers.getSigners();

    // Deploy MockERC20 as the asset
    const Asset = await ethers.getContractFactory("Token");
    const assetSymbol = 'FXD';
    const vaultDecimals = 18;
    const asset = await Asset.deploy(assetSymbol, vaultDecimals, { gasLimit: "0x1000000" });
    const assetType = 1; // 1 for Normal / 2 for Deflationary / 3 for Rebasing

    await asset.mint(deployer.address, ethers.parseEther(amount));

    const assetAddress = asset.target;

    const performanceFee = 100; // 1% of gain
    const protocolFee = 2000; // 20% of total fee

    const Accountant = await ethers.getContractFactory("GenericAccountant");
    const accountant = await Accountant.deploy(performanceFee, deployer.address, deployer.address, { gasLimit: "0x1000000" });

    const VaultLogic = await ethers.getContractFactory("VaultLogic");
    const vaultLogic = await VaultLogic.deploy({ gasLimit: "0x1000000" });

    const VaultPackage = await ethers.getContractFactory("VaultPackage", {
        libraries: {
            "VaultLogic": vaultLogic.target,
        }
    });
    const vaultPackage = await VaultPackage.deploy({ gasLimit: "0x1000000" });

    const FactoryPackage = await ethers.getContractFactory("FactoryPackage");
    const factoryPackage = await FactoryPackage.deploy({ gasLimit: "0x1000000" });

    const Factory = await ethers.getContractFactory("Factory");
    const factoryProxy = await Factory.deploy(factoryPackage.target, deployer.address, "0x", { gasLimit: "0x1000000" });

    const factory = await ethers.getContractAt("FactoryPackage", factoryProxy.target);
    await factory.initialize(vaultPackage.target, otherAccount.address, protocolFee);

    await factory.addVaultPackage(vaultPackage.target);

    // Deploy TokenizedStrategy
    const TokenizedStrategy = await ethers.getContractFactory("TokenizedStrategy");
    const tokenizedStrategy = await TokenizedStrategy.deploy(factoryProxy.target);
    
    await factory.deployVault(
        vaultPackage.target,
        profitMaxUnlockTime,
        assetType,
        assetAddress,
        vaultName,
        vaultSymbol,
        accountant.target,
        deployer.address
    );
    const vaults = await factory.getVaults();
    const vaultsCopy = [...vaults];
    const vaultAddress = vaultsCopy.pop();
    const vault = await ethers.getContractAt("VaultPackage", vaultAddress);

    const STRATEGY_MANAGER = ethers.keccak256(ethers.toUtf8Bytes("STRATEGY_MANAGER"));
    const REPORTING_MANAGER = ethers.keccak256(ethers.toUtf8Bytes("REPORTING_MANAGER"));
    const DEBT_PURCHASER = ethers.keccak256(ethers.toUtf8Bytes("DEBT_PURCHASER"));

    await vault.grantRole(STRATEGY_MANAGER, deployer.address);
    await vault.grantRole(REPORTING_MANAGER, deployer.address);
    await vault.grantRole(DEBT_PURCHASER, deployer.address);

    const Investor = await ethers.getContractFactory("Investor");
    const investor = await Investor.deploy({ gasLimit: "0x1000000" });

    // Deploy InvestorStrategy
    const InvestorStrategy = await ethers.getContractFactory("InvestorStrategy");
    const investorStrategy = await InvestorStrategy.deploy(
        investor.target,
        asset.target,
        "Investor Strategy",
        tokenizedStrategy.target
    );

    const strategy = await ethers.getContractAt("TokenizedStrategy", investorStrategy.target);

    // Setup Investor
    await asset.approve(investor.target, amount);
    await expect(investor.setStrategy(strategy.target))
        .to.emit(investor, 'StrategyUpdate')
        .withArgs(strategy.target, strategy.target, await vault.asset());
    let blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
    const startDistribution = blockTimestamp + 10;
    const endDistribution = blockTimestamp + 60;
    await expect(investor.setupDistribution(amount, startDistribution, endDistribution))
        .to.emit(investor, 'DistributionSetup')
        .withArgs(amount, startDistribution, endDistribution);
    expect(await investor.rewardsLeft()).to.equal(amount);
    expect(await investor.rewardRate()).to.equal(amount / (endDistribution - startDistribution));

    // Add Strategy to Vault
    await expect(vault.addStrategy(strategy.target))
        .to.emit(vault, 'StrategyChanged')
        .withArgs(strategy.target, 0);
    await expect(vault.updateMaxDebtForStrategy(strategy.target, amount))
        .to.emit(vault, 'UpdatedMaxDebtForStrategy')
        .withArgs(deployer.address, strategy.target, amount);

    return { vault, strategy, investor, asset, deployer, manager, otherAccount, profitMaxUnlockTime, assetType, vaultName, vaultSymbol, accountant, tokenizedStrategy };
}

async function deployVault() {
    const profitMaxUnlockTime = 30;
    const minAmountToSell = 1000;
    const amount = "1000";

    const vaultName = 'Vault Shares FXD';
    const vaultSymbol = 'vFXD';
    const [deployer, manager, otherAccount] = await ethers.getSigners();

    // Deploy MockERC20 as the asset
    const Asset = await ethers.getContractFactory("Token");
    const assetSymbol = 'FXD';
    const vaultDecimals = 18;
    const asset = await Asset.deploy(assetSymbol, vaultDecimals, { gasLimit: "0x1000000" });
    const assetType = 1; // 1 for Normal / 2 for Deflationary / 3 for Rebasing

    await asset.mint(deployer.address, ethers.parseEther(amount));

    const assetAddress = asset.target;

    const performanceFee = 100; // 1% of gain
    const protocolFee = 2000; // 20% of total fee

    const Accountant = await ethers.getContractFactory("GenericAccountant");
    const accountant = await Accountant.deploy(performanceFee, deployer.address, deployer.address, { gasLimit: "0x1000000" });

    const VaultLogic = await ethers.getContractFactory("VaultLogic");
    const vaultLogic = await VaultLogic.deploy({ gasLimit: "0x1000000" });

    const VaultPackage = await ethers.getContractFactory("VaultPackage", {
        libraries: {
            "VaultLogic": vaultLogic.target,
        }
    });
    const vaultPackage = await VaultPackage.deploy({ gasLimit: "0x1000000" });

    const FathomVault = await ethers.getContractFactory("FathomVault");
    const fathomVault = await FathomVault.deploy(vaultPackage.target, "0x");

    const vault = await ethers.getContractAt("VaultPackage", fathomVault.target);

    const STRATEGY_MANAGER = ethers.keccak256(ethers.toUtf8Bytes("STRATEGY_MANAGER"));
    const REPORTING_MANAGER = ethers.keccak256(ethers.toUtf8Bytes("REPORTING_MANAGER"));
    const DEBT_PURCHASER = ethers.keccak256(ethers.toUtf8Bytes("DEBT_PURCHASER"));

    await vault.grantRole(STRATEGY_MANAGER, deployer.address);
    await vault.grantRole(REPORTING_MANAGER, deployer.address);
    await vault.grantRole(DEBT_PURCHASER, deployer.address);

    const ONE_YEAR = 31_556_952;

    return { vault, asset, deployer, manager, otherAccount, profitMaxUnlockTime, assetType, vaultName, vaultSymbol, accountant, ONE_YEAR };
}

describe("VaultPackage tests", function () {

    describe("VaultPackage init tests", function () {
        it("Successfully initializes with correct parameters", async function () {
            const { asset, vault, profitMaxUnlockTime } = await loadFixture(deployVaultThroughFactory);
        
            expect(await vault.initialized()).to.equal(true);
            expect(await vault.profitMaxUnlockTime()).to.equal(profitMaxUnlockTime);
          });

        it("Reverts when trying to initialize a second time", async function () {
            const { asset, vault, profitMaxUnlockTime, assetType, vaultName, vaultSymbol, accountant, deployer } = await loadFixture(deployVaultThroughFactory);

            await expect(vault.initialize(
                profitMaxUnlockTime,
                assetType,
                asset.target,
                vaultName,
                vaultSymbol,
                accountant.target,
                deployer.address
            )).to.be.revertedWithCustomError(vault, "AlreadyInitialized");
        });

        it("Reverts when admin or asset address is zero", async function () {
            const { asset, vault, profitMaxUnlockTime, assetType, vaultName, vaultSymbol, accountant } = await loadFixture(deployVault);
            
            await expect(vault.initialize(
              profitMaxUnlockTime,
              assetType,
              asset.target,
              vaultName,
              vaultSymbol,
              accountant.target,
              ethers.ZeroAddress
            )).to.be.revertedWithCustomError(vault, "ZeroAddress");
        });

        it("Reverts if profitMaxUnlockTime is greater than ONE_YEAR", async function () {
            const { asset, vault, assetType, vaultName, vaultSymbol, accountant, deployer, ONE_YEAR } = await loadFixture(deployVault);

            await expect(vault.initialize(
              ONE_YEAR + 1,
              assetType,
              asset.target,
              vaultName,
              vaultSymbol,
              accountant.target,
              deployer.address
            )).to.be.revertedWithCustomError(vault, "ProfitUnlockTimeTooLong");
        });

        it("Ensures only DEFAULT_ADMIN_ROLE can call initialize", async function () {
            const { deployer, asset, vault, assetType, vaultName, vaultSymbol, accountant, otherAccount, profitMaxUnlockTime } = await loadFixture(deployVault);

            const role = "0x0000000000000000000000000000000000000000000000000000000000000000";
            const errorMsg = new RegExp(`AccessControl: account ${otherAccount.address.toLowerCase()} is missing role ${role}`);

            // Attempting to initialize from another account without the role
            await expect(vault.connect(otherAccount).initialize(
              profitMaxUnlockTime,
              assetType,
              asset.target,
              vaultName,
              vaultSymbol,
              accountant.target,
              deployer.address
            )).to.be.revertedWith(errorMsg);
        });
    });

    describe("setDefaultQueue()", function () {
        async function setupScenario() {
            const { deployer, otherAccount, strategy, asset, tokenizedStrategy, vault } = await loadFixture(deployVaultThroughFactory);
            const amount = 1000;

            const Investor = await ethers.getContractFactory("Investor");
            const investor2 = await Investor.deploy();
            const investor3 = await Investor.deploy();

            // Set up strategies
            const InvestorStrategy = await ethers.getContractFactory("InvestorStrategy");

            const investorStrategy2 = await InvestorStrategy.deploy(
                investor2.target,
                asset.target,
                "Investor Strategy 2",
                tokenizedStrategy.target
            );

            const investorStrategy3 = await InvestorStrategy.deploy(
                investor3.target,
                asset.target,
                "Investor Strategy 3",
                tokenizedStrategy.target
            );

            const strategy2 = await ethers.getContractAt("TokenizedStrategy", investorStrategy2.target);
            const inactiveStrategy = await ethers.getContractAt("TokenizedStrategy", investorStrategy3.target);

            // Setup Investor
            await asset.approve(investor2.target, amount);
            await expect(investor2.setStrategy(strategy2.target))
                .to.emit(investor2, 'StrategyUpdate')
                .withArgs(strategy2.target, strategy2.target, await vault.asset());
            let blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
            const startDistribution = blockTimestamp + 10;
            const endDistribution = blockTimestamp + 60;
            await expect(investor2.setupDistribution(amount, startDistribution, endDistribution))
                .to.emit(investor2, 'DistributionSetup')
                .withArgs(amount, startDistribution, endDistribution);
            expect(await investor2.rewardsLeft()).to.equal(amount);
            expect(await investor2.rewardRate()).to.equal(amount / (endDistribution - startDistribution));

            // Add Strategy to Vault
            await expect(vault.addStrategy(strategy2.target))
                .to.emit(vault, 'StrategyChanged')
                .withArgs(strategy2.target, 0);
            await expect(vault.updateMaxDebtForStrategy(strategy2.target, amount))
                .to.emit(vault, 'UpdatedMaxDebtForStrategy')
                .withArgs(deployer.address, strategy2.target, amount);

            return { vault, strategy, strategy2, inactiveStrategy, otherAccount };
        }

        it("Reverts when called by non-strategy manager", async function () {
            const { vault, otherAccount, strategy, strategy2 } = await setupScenario();

            const role = "0x1893e1a169e79f2fe8aa327b1bceb2fede7a1b76a54824f95ea0e737720954ae";
            const errorMsg = new RegExp(`AccessControl: account ${otherAccount.address.toLowerCase()} is missing role ${role}`);

            await expect(vault.connect(otherAccount).setDefaultQueue([strategy.target, strategy2.target]))
              .to.be.revertedWith(errorMsg);
        });

        it("Reverts when queue length exceeds MAX_QUEUE", async function () {
            const { vault, strategy } = await setupScenario();

            const MAX_QUEUE = 10;
            const oversizedQueue = new Array(MAX_QUEUE + 1).fill(strategy.target);
            await expect(vault.setDefaultQueue(oversizedQueue))
              .to.be.revertedWithCustomError(vault, "QueueTooLong");
        });

        it("Reverts when including inactive strategies", async function () {
            const { vault, strategy, inactiveStrategy } = await setupScenario();

            await expect(vault.setDefaultQueue([strategy.target, inactiveStrategy.target]))
              .to.be.revertedWithCustomError(vault, "InactiveStrategy");
        });

        it("Reverts when queue contains duplicates", async function () {
            const { vault, strategy } = await setupScenario();

            await expect(vault.setDefaultQueue([strategy.target, strategy.target]))
              .to.be.revertedWithCustomError(vault, "DuplicateStrategy");
        });

        it("Successfully updates default queue with active, non-duplicate strategies", async function () {
            const { vault, strategy, strategy2 } = await setupScenario();

            await expect(vault.setDefaultQueue([strategy.target, strategy2.target]))
              .to.emit(vault, "UpdatedDefaultQueue")
              .withArgs([strategy.target, strategy2.target]);
        });
    });
});