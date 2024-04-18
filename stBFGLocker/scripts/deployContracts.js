const { ethers, network } = require(`hardhat`);

const treasuryAddress = '0x359b9807F9F823A6C2a8AF5073b154085a156fe6'
const teamWalletAddress = '0xDb3B8B4542d1Fd25816B576B507BEa05B6488264'

const main = async () => {
    let accounts = await ethers.getSigners()
    let deployer = accounts[0]
    let nonce = await network.provider.send('eth_getTransactionCount', [deployer.address, 'latest']) - 1
    console.log(`Start deploying contracts. Deployer: ${deployer.address}`)

    const deployParamsStBFGLocker = [treasuryAddress, teamWalletAddress]
    const StBFGLockerFactory = await ethers.getContractFactory('StBFGLocker', deployer)
    const stBFGLocker = await StBFGLockerFactory.deploy(...deployParamsStBFGLocker, { nonce: ++nonce, gasLimit: 1e7})
    await stBFGLocker.deployed()
    console.log(`StBFGLocker contract deployed to ${stBFGLocker.address}`)

    // const LockBFGFactory = await ethers.getContractFactory('LockBFG', deployer)
    // const lockBFG = await LockBFGFactory.deploy(treasuryAddress, { nonce: ++nonce, gasLimit: 1e7})
    // await lockBFG.deployed()
    // console.log(`lockBFG contract deployed to ${lockBFG.address}`)

}

main().then(() => process.exit(0)).catch(e => console.error(e) && process.exit(1))
