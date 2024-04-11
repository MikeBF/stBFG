const { expect} = require(`chai`);
const { ethers, network} = require(`hardhat`);
const { BigNumber } = require("ethers");

const ERC20ABI = [
    'function transfer(address,uint256) public',
    'function balanceOf(address) external view returns(uint)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'event Transfer(address indexed from, address indexed to, uint256 value)'
]

let treasury, teamWallet, burnAddress, stBFGContract, bfgToken, startDay, lockDuration, lockDay1, lockDay2;


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
before(async function () {
    const accounts = await ethers.getSigners();
    treasury = accounts[0];
    teamWallet = accounts[1]
    burnAddress = accounts[2]
    //    /// @notice contract constructor
    //     /// @param _treasury set treasury address
    //     /// @param _teamWallet set team wallet address
    //     /// @param _burnAddress set burn address
    const deployArgs = [treasury.address, teamWallet.address, burnAddress.address]

    const StBFGContract = await ethers.getContractFactory('StBFGLocker')
    stBFGContract = await StBFGContract.deploy(...deployArgs)
    await stBFGContract.deployed()
    console.log(`stBFGContract deployed address ${stBFGContract.address}`)

    bfgToken = new ethers.Contract('0xBb46693eBbEa1aC2070E59B4D043b47e2e095f86', ERC20ABI, treasury)
    startDay = await stBFGContract.getCurrentDay()
    console.log({ startDay })
    lockDuration = await stBFGContract.lockDuration();
})

describe(`Check stBFG Contract`, async function () {

    it(`Check treasury balance (get BFG token for tests)`, async function () {
        await getERC20From_forking(
            '0x01dA1680437ef56D2598352f006b415DDDAb280C',
            bfgToken.address,
            toBN(1000000),
            treasury.address)
        expect(await bfgToken.balanceOf(treasury.address)).eq(toBN(1000000).toString())
    })

    it('Check deposit', async function () {
        const depositParams = [
            {
                transactionId: "0x619ceb8f1b9608097a3c29f0",
                amount: toBN(100)
            },
            {
                transactionId: "0x619ceb8f1b9608097a3c29f1",
                amount: toBN(50)
            }
        ];
        await bfgToken.connect(treasury).approve(stBFGContract.address, toBN(150))
        await expect(stBFGContract.deposit(depositParams)).to.emit(stBFGContract, 'Deposit')
        lockDay1 = await stBFGContract.getCurrentDay() + lockDuration
        //check balance
        expect(await bfgToken.balanceOf(stBFGContract.address)).eq(toBN(150))
        //check lock days
        expect(await stBFGContract.unlockPerDay(startDay + lockDuration)).eq(toBN(150))
        //check totalLockTokens
        expect(await stBFGContract.totalLockTokens()).eq(toBN(150))
    })

    it('Check second deposits', async function () {
        const depositParams = [
            {
                transactionId: "0x619ceb8f1b9608097a3c29f0",
                amount: toBN(10)
            },
            {
                transactionId: "0x619ceb8f1b9608097a3c29f1",
                amount: toBN(5)
            }
        ];
        await passTime(86400 * 2) //past 2 days
        expect(await stBFGContract.getCurrentDay() - startDay).eq(2)
        await bfgToken.connect(treasury).approve(stBFGContract.address, toBN(15))
        await expect(stBFGContract.deposit(depositParams)).to.emit(stBFGContract, 'Deposit')
        lockDay2 = await stBFGContract.getCurrentDay() + lockDuration
        //check balance
        expect(await bfgToken.balanceOf(stBFGContract.address)).eq(toBN(150+15))
        //check lock days
        expect(await stBFGContract.unlockPerDay(startDay + 2 + lockDuration)).eq(toBN(15))
        //check totalLockTokens
        expect(await stBFGContract.totalLockTokens()).eq(toBN(165))
    })


    it('Check withdraw with early withdraw fee', async function () {
        const withdrawParamForRevert = [
            {
                transactionId: "0x619ceb8f1b9608097a3c29f4",
                amount: toBN(10),
                lockEndDay: lockDay1,
                earlyWithdraw: true
            },
            {
                transactionId: "0x619ceb8f1b9608093a3c29f4",
                amount: toBN(1),
                lockEndDay: lockDay1,
                earlyWithdraw: false
            },
            {
                transactionId: "0x619ceb8f1b9608093a3c29f4",
                amount: toBN(5),
                lockEndDay: lockDay1,
                earlyWithdraw: true
            },
        ]
        await expect(stBFGContract.withdraw(withdrawParamForRevert)).revertedWith('Early withdraw not allowed')
        const withdrawParam = [
            {
                transactionId: "0x619ceb8f1b9608097a3c29f4",
                amount: toBN(1),
                lockEndDay: lockDay1,
                earlyWithdraw: true
            },
            {
                transactionId: "0x619ceb8f1b9608097a3c29f4",
                amount: toBN(4),
                lockEndDay: lockDay1,
                earlyWithdraw: true
            },
            {
                transactionId: "0x619ceb8f1b9608097a3c29f4",
                amount: toBN(5),
                lockEndDay: lockDay2,
                earlyWithdraw: true
            }]

        await expect(stBFGContract.withdraw(withdrawParam))
            .changeTokenBalances(bfgToken, [treasury, teamWallet, burnAddress], [toBN(5), toBN(25,17), toBN(25,17)])
            .to.emit(stBFGContract, 'Withdraw')
        expect(await stBFGContract.totalLockTokens()).eq(toBN(165-10))
        expect(await stBFGContract.totalUnlockTokens()).eq(0)
    })

    it('Check withdraw after end lock period', async function () {
        await passTime(86400 * (lockDuration))
        const withdrawParam = [{
            transactionId: "0x619ceb8f1b9608097a3c29f4",
            amount: toBN(50),
            lockEndDay: lockDay1,
            earlyWithdraw: false
        }]
        await expect(stBFGContract.withdraw(withdrawParam))
            .changeTokenBalances(bfgToken, [treasury, teamWallet, burnAddress], [toBN(50), 0, 0])
            .to.emit(stBFGContract, 'Withdraw')
    })

    it('Check withdraw all funds after lock', async function () {
        await passTime(86400 * 2)
        let withdrawParam = [{
            transactionId: "0x619ceb8f1b9608097a3c292e",
            amount: toBN(90),
            lockEndDay: lockDay1,
            earlyWithdraw: false
        }]
        await expect(stBFGContract.withdraw(withdrawParam))
            .changeTokenBalances(bfgToken, [treasury, teamWallet, burnAddress], [toBN(90), 0, 0])
            .to.emit(stBFGContract, 'Withdraw')
        withdrawParam = [{
            transactionId: "0x619ceb8f1b9608097a3c223e",
            amount: toBN(10),
            lockEndDay: lockDay2,
            earlyWithdraw: false
        }]
        await expect(stBFGContract.withdraw(withdrawParam))
            .changeTokenBalances(bfgToken, [treasury, teamWallet, burnAddress], [toBN(10), 0, 0])
            .to.emit(stBFGContract, 'Withdraw')
    })
})


