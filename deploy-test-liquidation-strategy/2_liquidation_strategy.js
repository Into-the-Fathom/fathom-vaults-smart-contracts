const { ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    //Base Strategy needs to have TokenizedStrategy address saved as constant.
    // Set these variables to the appropriate addresses for your deployment
    const strategyManagerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266..."; // Replace with actual strategy manager address
    //using account#0 from hardhat node for strategyManagerAddress
    const fixedSpreadLiquidationStrategyAddress = "0x610178dA211FEF7D417bC0e6FeD39F05609AD788"; // Replace with actual fixed spread liquidation strategy address
    //need to get the FSLS address from the terminal log from XDC fork project.
    const wrappedXDCAddress = "0x951857744785e80e2de051c32ee7b25f9c458c42"; // Replace with actual wrapped XDC address
    const bookKeeperAddress = "0x6FD3f049DF9e1886e1DFc1A034D379efaB0603CE"; // Replace with actual bookkeeper address
    const fathomStablecoinAddress = "0x49d3f7543335cf38Fa10889CCFF10207e22110B5"; // Replace with actual Fathom stablecoin address
    const usdTokenAddress = "0xD4B5f10D61916Bd6E0860144a91Ac658dE8a1437"; // Replace with actual USD token address
    const stablecoinAdapterAddress = "0xE3b248A97E9eb778c9B08f20a74c9165E22ef40E"; // Replace with actual stablecoin adapter address

    // Ensure these logs are accurate for the LiquidationStrategy contract
    console.log("WARN: Ensure You set real addresses for all the required parameters!!!");

    console.log("Sleeping for 60 seconds to give you a moment to double-check the addresses...");
    await new Promise(r => setTimeout(r, 60000));

    // Deploy the LiquidationStrategy contract
    const liquidationStrategy = await deploy("LiquidationStrategy", {
        from: deployer,
        args: [
            fathomStablecoinAddresso, // _asset
            "KimchiMagic", // Liquidation Strategy Name
            strategyManagerAddress, // _strategyManager
            fixedSpreadLiquidationStrategyAddress, // _fixedSpreadLiquidationStrategy
            wrappedXDCAddress, // _wrappedXDC
            bookKeeperAddress, // _bookKeeper
            fathomStablecoinAddress, // _fathomStablecoin
            usdTokenAddress, // _usdToken
            stablecoinAdapterAddress // _stablecoinAdapter
        ],
        log: true,
    });
};

module.exports.tags = ["LiquidationStrategy"];
