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

    fs.writeFileSync(filePath, content);
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


    // return TokenizedStrategy.sol with the deployed factory address
    content = fs.readFileSync(filePath, 'utf8');

    // return the placeholder address
    const placeholder2 = `${factory.address}`;
    content = content.replace(`address public constant FACTORY = ${placeholder2};`, `address public constant FACTORY = ${placeholder};`);

    fs.writeFileSync(filePath, content);
};

module.exports.tags = ["Factory", "GenericAccountant", "VaultPackage", "FactoryPackage", "TokenizedStrategy"];
