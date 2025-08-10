// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ClobPair.sol";
import "./interfaces/IClobFactory.sol";

contract ClobFactory is IClobFactory {
    // key by base->quote->tickSize (we use uint256 tickSize as key)
    mapping(address => mapping(address => mapping(uint256 => address))) public pairs;
    address[] public allPairs;
    event PairCreated(address indexed base, address indexed quote, uint256 tickSize, address pair);

    function createPair(address base, address quote, uint256 tickSize, address vault, uint256 treeSize) external returns (address) {
        require(base != quote, "IDENTICAL");
        // canonical ordering: smaller address first
        (address a, address b) = base < quote ? (base, quote) : (quote, base);
        require(pairs[a][b][tickSize] == address(0), "EXISTS");

        ClobPair p = new ClobPair(a, b, tickSize, vault, treeSize);
        address pairAddr = address(p);
        pairs[a][b][tickSize] = pairAddr;
        pairs[b][a][tickSize] = pairAddr; // allow reverse lookup
        allPairs.push(pairAddr);
        emit PairCreated(a, b, tickSize, pairAddr);
        return pairAddr;
    }

    function getPair(address base, address quote, uint256 tickSize) external view returns (address) {
        (address a, address b) = base < quote ? (base, quote) : (quote, base);
        return pairs[a][b][tickSize];
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }
}
