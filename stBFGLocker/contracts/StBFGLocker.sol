// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

import "./IERC20.sol";

// @notice user data for deposits
struct UserDataDeposit {
    bytes12 transactionId;
    uint128 amount;
}

// @notice user data for withdraws
struct UserDataWithdraw {
    bytes12 transactionId;
    uint128 amount;
    uint32 lockEndDay;
    bool earlyWithdraw; //Allow early withdraw if True
}

/// @title BFG token lock contract for specific period use for stBFG
contract StBFGLocker {

    /// @notice BFG token ERC20 interface
    IERC20 constant bfg = IERC20(0xBb46693eBbEa1aC2070E59B4D043b47e2e095f86);

    /// @notice shift time to calculate current day
    uint32 constant internal shiftTime = 12 hours;
    /// @notice percent scale factor
    uint constant private PERCENT_SCALE_FACTOR = 100;

    /// @notice early withdrawal fee
    uint constant teamDist = 25;
    /// @notice distribution for burn while early withdrawal
    uint constant burnDist = 25;
    /// @notice lock duration
    uint32 public constant lockDuration = 365;

    /// @notice treasury address
    address internal treasury;
    /// @notice team wallet address
    address internal teamWallet;
    /// @notice total tokens locked in contract
    uint public totalLockTokens;
    /// @notice amount of unlock tokens on contract balance
    uint public totalUnlockTokens;
    /// @notice last update day
    uint32 public lastUpdateDay;
    /// @notice unlock tokens per period
    mapping(uint32 => uint) public unlockPerDay;

    /// @notice emit when treasury address is set
    event NewTreasury(address newTreasury);
    /// @notice emit when deposit is completed
    event Deposit(UserDataDeposit[]);
    /// @notice emit when withdrawal is completed
    event Withdraw(UserDataWithdraw[]);

    /// @notice modifier for only treasury calls
    modifier onlyTreasury(){
        require(msg.sender == treasury, "Only treasury call");
        _;
    }

    /// @notice contract constructor
    /// @param _treasury set treasury address
    /// @param _teamWallet set team wallet address
    constructor(
        address _treasury,
        address _teamWallet
    ){
        require(
            _treasury != address(0) &&
            _teamWallet != address(0)
            , "Cant be zero address"
        );
        treasury = _treasury;
        teamWallet = _teamWallet;
        lastUpdateDay = getCurrentDay();
        emit NewTreasury(_treasury);
    }

    /// @notice get number of current day
    /// @return count of days
    function getCurrentDay() public view returns(uint32){
        return (uint32(block.timestamp) + shiftTime) / 1 days;
    }

    /// @notice set new treasury address
    /// @dev only call from treasury address
    function setTreasury(address newTreasury) external onlyTreasury {
        require(newTreasury != address(0), "Cant be zero address");
        treasury = newTreasury;
        emit NewTreasury(newTreasury);
    }

    /// @notice update current day with unlock amount
    function updateDay() public {
        uint32 _lastUpdateDay = lastUpdateDay;
        uint32 curDay = getCurrentDay();
        uint unlockAmount;
        for(uint32 i = 1; i <= curDay - _lastUpdateDay; i++){
            unlockAmount += unlockPerDay[_lastUpdateDay + i];
        }
        lastUpdateDay = curDay;
        unlockAmount = unlockAmount > totalLockTokens ? totalLockTokens : unlockAmount;
        totalLockTokens -= unlockAmount;
        totalUnlockTokens += unlockAmount;
    }

    /// @notice deposit bfg to pool
    /// @param data user deposit data with transaction id and amount
    function deposit(UserDataDeposit[] calldata data) external {
        updateDay();
        uint128 amount;
        for(uint i; i < data.length; i++){
            amount += data[i].amount;
        }
        unlockPerDay[getCurrentDay() + lockDuration] += amount;
        totalLockTokens += amount;
        bfg.transferFrom(msg.sender, address(this), amount);
        emit Deposit(data);
    }

    /// @notice withdraw bfg from pool
    /// @param data user withdraw data with transaction id, amount and lock end period
    /// @dev only treasury can call
    /// @dev Only sorted data by lock end day (asc) is allowed
    function withdraw(UserDataWithdraw[] calldata data) external onlyTreasury {
        require(data.length > 0, "Wrong array length");
        updateDay();
        uint curUnlockAmount;
        uint32 curLockEndDay;
        bool curEarlyWithdraw;
        uint teamDistribution;
        uint burnDistribution;
        uint amount;
        if(data.length == 1){
            (teamDistribution, burnDistribution, amount) = dailyWithdrawalProcessing(data[0].lockEndDay, data[0].amount, data[0].earlyWithdraw);
        } else {
            curUnlockAmount = data[0].amount;
            curEarlyWithdraw = data[0].earlyWithdraw;
            for(uint i = 1; i < data.length; i++){
                if(data[i].lockEndDay == data[i-1].lockEndDay){
                    curUnlockAmount += data[i].amount;
                    curEarlyWithdraw = curEarlyWithdraw && data[i].earlyWithdraw;
                    curLockEndDay = data[i].lockEndDay;
                    continue;
                } else if(data[i].lockEndDay > data[i-1].lockEndDay){
                    (
                        uint _teamDistribution,
                        uint _burnDistribution,
                        uint _amount
                    ) = dailyWithdrawalProcessing(curLockEndDay, curUnlockAmount, curEarlyWithdraw);
                    teamDistribution += _teamDistribution;
                    burnDistribution += _burnDistribution;
                    amount += _amount;

                    curLockEndDay = data[i].lockEndDay;
                    curUnlockAmount = data[i].amount;
                    curEarlyWithdraw = data[i].earlyWithdraw;
                } else revert("Sort data by lock end day (asc)");
            }
            (
                uint _teamDistribution,
                uint _burnDistribution,
                uint _amount
            ) = dailyWithdrawalProcessing(curLockEndDay, curUnlockAmount, curEarlyWithdraw);
            teamDistribution += _teamDistribution;
            burnDistribution += _burnDistribution;
            amount += _amount;
        }
        teamDistribution > 0 && bfg.transfer(teamWallet, teamDistribution);
        burnDistribution > 0 && bfg.burn(burnDistribution);
        bfg.transfer(treasury, amount);
        totalUnlockTokens -= amount + teamDistribution + burnDistribution;
        emit Withdraw(data);
    }

    function dailyWithdrawalProcessing(uint32 lockEndDay, uint _amount, bool earlyWithdraw)
        private returns
    (
        uint teamDistribution,
        uint burnDistribution,
        uint amount
    ){
        //check early withdraw
        if(lockEndDay > getCurrentDay()){
            require(earlyWithdraw, "Early withdraw not allowed");
            teamDistribution = _amount * teamDist  / PERCENT_SCALE_FACTOR;
            burnDistribution = _amount * burnDist / PERCENT_SCALE_FACTOR;
            amount = _amount - (teamDistribution + burnDistribution);
            totalLockTokens -= _amount;
            totalUnlockTokens += _amount;
            require(unlockPerDay[lockEndDay] >= _amount, "wrong lock end day or amount");
            unlockPerDay[lockEndDay] -= _amount;
        } else {
            amount = _amount;
        }
        return(teamDistribution, burnDistribution, amount);
    }
}
