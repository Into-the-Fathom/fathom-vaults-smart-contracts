const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const getTheAbi = (contract) => {
    try {
        const dir = path.join(__dirname, "..", "deployments", "apothem", `${contract}.json`);
        const json = JSON.parse(fs.readFileSync(dir, "utf8"));
        return json;
    } catch (e) {
        console.log(`e`, e);
    }
};

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const asset = ""; // Real asset address
    console.log("Asset address: ", asset);
    
    console.log("WARN: Ensure to set real asset address!!!");
    console.log("WARN: Ensure BaseStrategy has tokenizedStrategyAddress as constant!!!");
    
    console.log("Sleeping for 60 seconds to give a thought...");
    await new Promise(r => setTimeout(r, 60000));

    const investorFile = getTheAbi("Investor");
    const investorAddress = investorFile.address;
    const investor = await ethers.getContractAt("Investor", investorAddress);

    const strategy = await deploy("InvestorStrategy", {
        from: deployer,
        args: [investorAddress, asset, "Fathom Investor Strategy 1"],
        log: true,
    });

    const setInvestorStrategyTx = await investor.setStrategy(strategy.address);
    await setInvestorStrategyTx.wait();
};

module.exports.tags = ["InvestorStrategy"];
