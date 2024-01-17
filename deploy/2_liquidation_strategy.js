const { ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    // Set these variables to the appropriate addresses for your deployment
    const strategyManagerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266..."; // Replace with actual strategy manager address
    //using account#0 from hardhat node for strategyManagerAddress
    const fixedSpreadLiquidationStrategyAddress = "0x..."; // Replace with actual fixed spread liquidation strategy address
    const wrappedXDCAddress = "0x..."; // Replace with actual wrapped XDC address
    const bookKeeperAddress = "0x..."; // Replace with actual bookkeeper address
    const fathomStablecoinAddress = "0x..."; // Replace with actual Fathom stablecoin address
    const usdTokenAddress = "0x..."; // Replace with actual USD token address
    const stablecoinAdapterAddress = "0x..."; // Replace with actual stablecoin adapter address

    // Ensure these logs are accurate for the LiquidationStrategy contract
    console.log("WARN: Ensure You set real addresses for all the required parameters!!!");

    console.log("Sleeping for 60 seconds to give you a moment to double-check the addresses...");
    await new Promise(r => setTimeout(r, 60000));

    // Deploy the LiquidationStrategy contract
    const liquidationStrategy = await deploy("LiquidationStrategy", {
        from: deployer,
        args: [
            ethers.constants.AddressZero, // Replace this with the actual asset address if needed
            "Liquidation Strategy Name", // Replace with the actual name if needed
            strategyManagerAddress,
            fixedSpreadLiquidationStrategyAddress,
            wrappedXDCAddress,
            bookKeeperAddress,
            fathomStablecoinAddress,
            usdTokenAddress,
            stablecoinAdapterAddress
        ],
        log: true,
    });
};

module.exports.tags = ["LiquidationStrategy"];
