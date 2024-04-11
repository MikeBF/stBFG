const { ethers, network } = require(`hardhat`);

const treasuryAddress = '0xBb46693eBbEa1aC2070E59B4D043b47e2e095f86'
const teamWalletAddress = '0xBb46693eBbEa1aC2070E59B4D043b47e2e095f86'
const burnAddress = '0xBb46693eBbEa1aC2070E59B4D043b47e2e095f86'

const main = async () => {
    let accounts = await ethers.getSigners()
    let deployer = accounts[0]
    let nonce = await network.provider.send('eth_getTransactionCount', [deployer.address, 'latest']) - 1
    console.log(`Start deploing contracts. Deployer: ${deployer.address}`)

    const deployParamsStBFGLocker = [treasuryAddress, teamWalletAddress, burnAddress]
    const StBFGLockerFactory = await ethers.getContractFactory('StBFGLocker', deployer)
    const stBFGLocker = await StBFGLockerFactory.deploy(...deployParamsStBFGLocker, { nonce: ++nonce, gasLimit: 1e7})
    await stBFGLocker.deployed()
    console.log(`StBFGLocker contract deployed to ${stBFGLocker.address}`)

    const LockBFGFactory = await ethers.getContractFactory('LockBFG', deployer)
    const lockBFG = await LockBFGFactory.deploy(treasuryAddress, { nonce: ++nonce, gasLimit: 1e7})
    await lockBFG.deployed()
    console.log(`lockBFG contract deployed to ${lockBFG.address}`)

}

main().then(() => process.exit(0)).catch(e => console.error(e) && process.exit(1))
