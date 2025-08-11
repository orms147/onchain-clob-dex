// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./interfaces/IClobPair.sol";
import "./libraries/SegmentedSegmentTree.sol";

contract ClobPair is IClobPair {

    struct OrderNode {
        uint64 prev;
        uint64 next;
        address provider;
        uint128 remainingToken;
    }
    
    struct LevelQueue {
        uint64 head;
        uint64 tail;
        uint64 length;
        uint128 aggToken;
    }


    // key: base -> quote -> tickSize -> pair
    mapping(uint256 => PriceLevels) private _orderBook;
    constructor () {
        return;
    }
}
