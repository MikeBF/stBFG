const { expect} = require(`chai`);
const { ethers, network} = require(`hardhat`);
const { BigNumber } = require("ethers");

const ERC20ABI = [
    'function transfer(address,uint256) public',
    'function balanceOf(address) external view returns(uint)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'event Transfer(address indexed from, address indexed to, uint256 value)'
]

let treasury, randomWallet, vestingParts, lockBFGContract, bfgToken, curTimestamp, lockDuration, vestingPeriod;


getERC20From_forking = async (from, ERC20_address, howMuch = module.exports.toBN(1), to) => {
    await network.provider.request({method: 'hardhat_impersonateAccount', params: [from]})
    await network.provider.send('hardhat_setBalance', [from, '0x10000000000000000000000000'])
    const ERC20_contract = new ethers.Contract(ERC20_address, ['function transfer(address,uint256) public'], await ethers.provider.getSigner(from))
    await ERC20_contract.transfer(to || (await ethers.getSigners())[0].address, howMuch)
    await network.provider.request({method: 'hardhat_stopImpersonatingAccount', params: [from]})
}

toBN = (n, power = 18) => ethers.BigNumber.from(10).pow(power).mul(n)

passTime = async ms => {
    await network.provider.send('evm_increaseTime', [ms])
    await network.provider.send('evm_mine')
}

getTimestamp = async () => (await network.provider.send('eth_getBlockByNumber', ['latest', false])).timestamp
before(async function () {
    const accounts = await ethers.getSigners();
    treasury = accounts[0];
    randomWallet = accounts[1]

    const LockBFGContract = await ethers.getContractFactory('LockBFG')
    lockBFGContract = await LockBFGContract.deploy(treasury.address)
    await lockBFGContract.deployed()
    console.log(`lockBFGContract deployed address ${lockBFGContract.address}`)

    bfgToken = new ethers.Contract('0xBb46693eBbEa1aC2070E59B4D043b47e2e095f86', ERC20ABI, treasury)

    lockDuration = await lockBFGContract.lockDuration();
    vestingParts = await lockBFGContract.vestingParts()
    vestingPeriod = await lockBFGContract.vestingPeriod()

})

describe(`Check Lock BFG contract`, async function () {

    it(`Check treasury balance (get BFG token for tests)`, async function () {
        const amount = toBN(1000000)
        await getERC20From_forking(
            '0x01dA1680437ef56D2598352f006b415DDDAb280C',
            bfgToken.address,
            amount,
            treasury.address)
        expect(await bfgToken.balanceOf(treasury.address)).eq(amount)
    })

    it('Check tokens locking', async function () {
        // function lockTokens(uint amount)
        const amount = toBN(100)
        await bfgToken.connect(treasury).approve(lockBFGContract.address, amount.mul(2))
        await expect(lockBFGContract.lockTokens(amount))
            .changeTokenBalances(bfgToken, [treasury, lockBFGContract], [toBN(0).sub(amount), amount])
            .to.emit(lockBFGContract, 'LockTokens')
        expect(await lockBFGContract.lockedAmount()).eq(amount)
        expect(await lockBFGContract.vestingAmount()).eq(amount.div(vestingParts))
        const unlockTimestamp = await lockBFGContract.unlockTimestamp()
        curTimestamp = await getTimestamp();
        expect(unlockTimestamp).eq(lockDuration.add(curTimestamp))
        await expect(lockBFGContract.lockTokens(amount))
            .changeTokenBalances(bfgToken, [treasury, lockBFGContract], [toBN(0).sub(amount), amount])
            .to.emit(lockBFGContract, 'LockTokens')
        expect(await lockBFGContract.unlockTimestamp()).eq(unlockTimestamp) // shouldn't change
        let lockedAmount = await lockBFGContract.lockedAmount()
        expect(lockedAmount).eq(amount.mul(2))
        expect(await lockBFGContract.vestingAmount()).eq(lockedAmount.div(vestingParts))
    })

    it('Check withdraw tokens', async function () {
        await getTimestamp() < await lockBFGContract.unlockTimestamp() &&
            await expect(lockBFGContract.withdraw()).revertedWith('Tokens are not unlocked yet')
        await passTime(lockDuration.toString())

        const vestingAmount = await lockBFGContract.vestingAmount();

        for(let i = 1; i <= 20; i++){
            await expect(lockBFGContract.withdraw())
                .to.emit(lockBFGContract, "WithdrawTokens")
                .changeTokenBalances(bfgToken, [lockBFGContract, treasury], [toBN(0).sub(vestingAmount), vestingAmount])
            await expect(lockBFGContract.withdraw()).revertedWith('All vesting parts withdrawn')
            await passTime(vestingPeriod.toString())
        }

    })

    it('Check final withdraw tokens ', async function (){
        const LockBFGContract = await ethers.getContractFactory('LockBFG')
        lockBFGContract = await LockBFGContract.deploy(treasury.address)
        await lockBFGContract.deployed()
        const amount = toBN(100)
        await bfgToken.connect(treasury).approve(lockBFGContract.address, amount.mul(2))
        await expect(lockBFGContract.lockTokens(amount))
            .changeTokenBalances(bfgToken, [treasury, lockBFGContract], [toBN(0).sub(amount), amount])
            .to.emit(lockBFGContract, 'LockTokens')
        await expect(lockBFGContract.finalWithdraw()).revertedWith('All vesting periods have not yet passed')
        await passTime((lockDuration.add(vestingPeriod.mul(vestingParts))).toString())
        await expect(lockBFGContract.finalWithdraw())
            .to.emit(lockBFGContract, 'WithdrawTokens')
            .changeTokenBalances(bfgToken, [lockBFGContract, treasury], [toBN(0).sub(amount), amount])
    })

})
