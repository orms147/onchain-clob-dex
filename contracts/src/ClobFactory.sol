// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./ClobPair.sol";
import "./interfaces/IClobFactory.sol";
import "./interfaces/IVault.sol";

contract ClobFactory is IClobFactory {
    address public immutable vault;

    // key: base -> quote -> tickSize -> pair
    mapping(address => mapping(address => mapping(uint256 => address))) public pairs;
    address[] private _allPairs;

    constructor (address _vault) {
        require(_vault != address(0), "VAULT_ZERO");
        vault = _vault;
    }

    function createClobPair(address base, address quote, uint256 tickSize) external returns (address pair) {
        require(base != address(0) && quote != address(0), "ZERO_ADDRESS");
        require(base != quote, "IDENTICAL");
        require(tickSize > 0, "ZERO_TICK_SIZE");
        require(tickSize <= 32767, "TICK_SIZE_TOO_LARGE"); // MAX_TICK_INDEX
        
        // Check if tokens are supported by vault
        require(IVault(vault).isSupportedToken(base), "BASE_TOKEN_NOT_SUPPORTED");
        require(IVault(vault).isSupportedToken(quote), "QUOTE_TOKEN_NOT_SUPPORTED");
        
        (address a, address b) = base < quote ? (base, quote) : (quote, base);
        require(pairs[a][b][tickSize] == address(0), "EXISTS");

        pair = address(new ClobPair(a, b, uint32(tickSize), vault));

        pairs[a][b][tickSize] = pair;
        pairs[b][a][tickSize] = pair; // reverse lookup allowed
        _allPairs.push(pair);

        emit PairCreated(a, b, tickSize, pair);
    }

function getClobPair(address base, address quote, uint256 tickSize)
        external
        view
        override
        returns (address clobPair)
    {
        (address a, address b) = base < quote ? (base, quote) : (quote, base);
        return pairs[a][b][tickSize];
    }

    function getAllPairs() external view override returns (address[] memory pairs_) {
        return _allPairs;
    }

    function getPairCount() external view override returns (uint256 count) {
        return _allPairs.length;
    }

    function computePairKey(address base, address quote, uint256 tickSize)
        external
        pure
        override
        returns (bytes32 key)
    {
        (address a, address b) = base < quote ? (base, quote) : (quote, base);
        return keccak256(abi.encodePacked(a, b, tickSize));
    }

    function getVault() external view override returns (address) {
        return vault;
    }
}
