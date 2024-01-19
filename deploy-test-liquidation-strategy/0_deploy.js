const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const fs = require('fs');
const path = require('path');

module.exports = async ({ getNamedAccounts, deployments, ethers }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const performanceFee = 1000; // 10% of gain

    const genericAccountant = await deploy("GenericAccountant", {
        from: deployer,
        args: [performanceFee, deployer, deployer],
        log: true,
    });

    const vaultPackage = await deploy("VaultPackage", {
        from: deployer,
        args: [],
        log: true,
    });

    const factoryPackage = await deploy("FactoryPackage", {
        from: deployer,
        args: [],
        log: true,
    });

    const factory = await deploy("Factory", {
        from: deployer,
        args: [factoryPackage.address, deployer, "0x"],
        log: true,
    });

    // Update TokenizedStrategy.sol with the deployed factory address
    const filePath = path.join(__dirname, '../contracts/strategy/TokenizedStrategy.sol');
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace the placeholder address with the actual one
    const placeholder = '0x0000000000000000000000000000000000000000';
    content = content.replace(`address public constant FACTORY = ${placeholder};`, `address public constant FACTORY = ${factory.address};`);
    await new Promise(r => setTimeout(r, 2000));
    fs.writeFileSync(filePath, content);
    await new Promise(r => setTimeout(r, 2000));
    console.log('TokenizedStrategy.sol has been updated with the new FACTORY address');

    // Compile the contracts
    try {
        const { stdout, stderr } = await exec('npx hardhat compile');
        console.log(stdout);
        console.error(stderr);
        console.log('Compilation completed successfully');
    } catch (error) {
        console.error(`Compilation failed: ${error}`);
    }

    const strategy = await deploy("TokenizedStrategy", {
        from: deployer,
        args: [],
        log: true,
    });

    // Update TokenizedStrategy.sol with the deployed factory address
    const filePath2 = path.join(__dirname, '../contracts/strategy/BaseStrategy.sol');
    let content2 = fs.readFileSync(filePath2, 'utf8');

    // Replace the placeholder address with the actual one
    content2 = content2.replace(`address public constant tokenizedStrategyAddress = ${placeholder};`, `address public constant tokenizedStrategyAddress = ${strategy.address};`);

    fs.writeFileSync(filePath2, content2);
    console.log('BasedStrategy.sol has been updated with the new tokenizedStrategyAddress address');

    // Compile the contracts
    try {
        const { stdout, stderr } = await exec('npx hardhat compile');
        console.log(stdout);
        console.error(stderr);
        console.log('Compilation completed successfully');
    } catch (error) {
        console.error(`Compilation failed: ${error}`);
    }

    //Base Strategy needs to have TokenizedStrategy address saved as constant.
    // Set these variables to the appropriate addresses for your deployment
    const strategyManagerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Replace with actual strategy manager address
    //using account#0 from hardhat node for strategyManagerAddress
    const fixedSpreadLiquidationStrategyAddress = "0x610178dA211FEF7D417bC0e6FeD39F05609AD788"; // Replace with actual fixed spread liquidation strategy address
    //need to get the FSLS address from the terminal log from XDC fork project.
    const wrappedXDCAddress = "0x951857744785e80e2de051c32ee7b25f9c458c42"; // Replace with actual wrapped XDC address
    const bookKeeperAddress = "0x6FD3f049DF9e1886e1DFc1A034D379efaB0603CE"; // Replace with actual bookkeeper address
    const fathomStablecoinAddress = "0x49d3f7543335cf38Fa10889CCFF10207e22110B5"; // Replace with actual Fathom stablecoin address
    const usdTokenAddress = "0xD4B5f10D61916Bd6E0860144a91Ac658dE8a1437"; // Replace with actual USD token address
    const stablecoinAdapterAddress = "0xE3b248A97E9eb778c9B08f20a74c9165E22ef40E"; // Replace with actual stablecoin adapter address


    const liquidationStrategy = await deploy("LiquidationStrategy", {
        from: deployer,
        args: [
            fathomStablecoinAddress, // _asset
            "KimchiMagic", // Liquidation Strategy Name
            strategyManagerAddress, // _strategyManager
            fixedSpreadLiquidationStrategyAddress, // _fixedSpreadLiquidationStrategy
            wrappedXDCAddress, // _wrappedXDC
            bookKeeperAddress, // _bookKeeper
            usdTokenAddress, // _usdToken
            stablecoinAdapterAddress // _stablecoinAdapter
        ],
        log: true,
        gasLimit: 10000000
    });


    // return TokenizedStrategy.sol with the deployed factory address back to address(0)
    content = fs.readFileSync(filePath, 'utf8');

    // return the placeholder address
    const placeholder2 = `${factory.address}`;
    content = content.replace(`address public constant FACTORY = ${placeholder2};`, `address public constant FACTORY = ${placeholder};`);

    fs.writeFileSync(filePath, content);


    // return BaseStrategy.sol with the deployed tokenizedStrategyAddress back to address(0)
    // Todo
    content2 = fs.readFileSync(filePath2, 'utf8');
    content2 = content2.replace(`address public constant tokenizedStrategyAddress = ${strategy.address};`, `address public constant tokenizedStrategyAddress = ${placeholder};`);
    fs.writeFileSync(filePath2, content2);

};

module.exports.tags = ["Factory", "GenericAccountant", "VaultPackage", "FactoryPackage", "TokenizedStrategy", "LiquidationStrategy"];
