// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./libraries/OrderStructs.sol";
import "./libraries/SegmentTree.sol";
import "./interfaces/IVault.sol";

contract ClobPair {
    using SegmentTree for SegmentTree.Tree;

    address public immutable baseToken;
    address public immutable quoteToken;
    uint256 public immutable tickSize;
    IVault public immutable vault;

    // Active price levels (bitmap)
    SegmentTree.Tree private bids; // best = highest
    SegmentTree.Tree private asks; // best = lowest

    constructor(address _base, address _quote, uint256 _tickSize, address _vault) {
        require(_base != address(0) && _quote != address(0) && _vault != address(0), "ZERO");
        require(_base != _quote, "IDENTICAL");
        baseToken = _base;
        quoteToken = _quote;
        tickSize = _tickSize;
        vault = IVault(_vault);


        bids.initialize(0, 65535);
        asks.initialize(0, 65535);
    }

    // Helpers
    function bestBidTick() external view returns (uint256) {
        return bids.getHighest();
    }
    function bestAskTick() external view returns (uint256) {
        return asks.getLowest();
    }
}