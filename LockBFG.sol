// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

import "./IERC20.sol";
import "hardhat/console.sol";

/// @title Contract to lock dev team BFG tokens
contract LockBFG {

    /// @notice BFG token ERC20 interface
    IERC20 constant bfg = IERC20(0xBb46693eBbEa1aC2070E59B4D043b47e2e095f86);
    /// @notice how many parts vesting takes
    uint public constant vestingParts = 20;
    /// @notice vesting period of each part
    uint public constant vestingPeriod = 30 days;
    /// @notice lock period after that tokens unlocked by vesting periods
    uint public constant lockDuration = 3 * 365 days;
    /// @notice tokens locked amount
    uint public lockedAmount;
    /// @notice unlock tokens amount for each vesting period
    uint public vestingAmount;
    /// @notice timestamp when lock period ended
    uint public unlockTimestamp;
    /// @notice how many parts have been withdrawn
    uint public vestingCountWithdrawn;
    /// @notice treasury address
    address public treasury;

    /// @notice emit when tokens locked
    /// @param amount amount locked tokens
    /// @param unlockTimestamp timestamp when tokens can be unlocked
    event LockTokens(uint amount, uint unlockTimestamp);
    /// @notice emit when withdraw tokens
    event WithdrawTokens(uint withdrawAmount);

    constructor(address _treasury) {
        require(_treasury != address(0), "Cant be zero address");
        treasury = _treasury;
    }

    /// @notice function to lock tokens
    /// @param amount amount of locked tokens
    function lockTokens(uint amount) external {
        unlockTimestamp = unlockTimestamp == 0 ? block.timestamp + lockDuration : unlockTimestamp;
        require(unlockTimestamp > block.timestamp, "Cant lock tokens after unlock ended");
        bfg.transferFrom(msg.sender, address(this), amount);
        lockedAmount += amount;
        vestingAmount = lockedAmount / vestingParts;
        emit LockTokens(amount, unlockTimestamp);
    }

    /// @notice withdraw unlocked tokens
    function withdraw() external {
        require(unlockTimestamp < block.timestamp, "Tokens are not unlocked yet");
        require(vestingCountWithdrawn <= vestingParts,"All parts withdrawn");

        uint vestingCount = (block.timestamp - unlockTimestamp) / vestingPeriod + 1;
        require(vestingCount > vestingCountWithdrawn && vestingCount <= vestingParts, "All vesting parts withdrawn");
        uint withdrawAmount = (vestingCount - vestingCountWithdrawn) * vestingAmount > lockedAmount ?
            lockedAmount :
            (vestingCount - vestingCountWithdrawn) * vestingAmount;
        vestingCountWithdrawn += 1;
        lockedAmount -= withdrawAmount;
        if(withdrawAmount > 0) {
            bfg.transfer(treasury, withdrawAmount);
            emit WithdrawTokens(withdrawAmount);
        }
    }

    /// @notice final withdraw tokens when end lock period and all vesting periods
    function finalWithdraw() external {
        uint allVestingDoneTimestamp = (vestingParts - 1) * vestingPeriod + unlockTimestamp;
        require(block.timestamp >= allVestingDoneTimestamp, "All vesting periods have not yet passed");
        uint amount = bfg.balanceOf(address(this));
        bfg.transfer(treasury, amount);
        emit WithdrawTokens(amount);
    }
}
