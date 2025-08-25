// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./ClobPair.sol";
import "./interfaces/IClobFactory.sol";
import "./interfaces/IVault.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ClobFactory is IClobFactory, Ownable {
    address public immutable vault;
    address public router;

    mapping(address => mapping(address => mapping(uint256 => address))) public pairs;
    address[] private _allPairs;

    event RouterSet(address indexed newRouter);

    constructor(address _vault) Ownable(msg.sender) {
        require(_vault != address(0), "VAULT_ZERO");
        vault = _vault;
    }

    function setRouter(address _router) external onlyOwner {
        require(_router != address(0), "ROUTER_ZERO");
        router = _router;
        emit RouterSet(_router);
    }

    function addSupportedToken(address token) external onlyOwner {
        IVault(vault).addSupportedToken(token);
    }

    function removeSupportedToken(address token) external onlyOwner {
        IVault(vault).removeSupportedToken(token);
    }

    function authorizeExecutor(address executor, bool isAuthorized) external onlyOwner {
        IVault(vault).authorizeExecutor(executor, isAuthorized);
    }

    function pauseVault() external onlyOwner {
        IVault(vault).pause();
    }

    function unpauseVault() external onlyOwner {
        IVault(vault).unpause();
    }

    function createClobPair(address base, address quote, uint256 tickSize) external returns (address pair) {
        require(base != address(0) && quote != address(0), "ZERO_ADDRESS");
        require(base != quote, "IDENTICAL");
        require(tickSize > 0, "ZERO_TICK_SIZE");

        require(IVault(vault).isSupportedToken(base), "BASE_TOKEN_NOT_SUPPORTED");
        require(IVault(vault).isSupportedToken(quote), "QUOTE_TOKEN_NOT_SUPPORTED");

        (address a, address b) = base < quote ? (base, quote) : (quote, base);
        require(pairs[a][b][tickSize] == address(0), "EXISTS");

        require(router != address(0), "ROUTER_NOT_SET");
        pair = address(new ClobPair(a, b, tickSize, vault, router));

        IVault(vault).authorizeExecutor(pair, true);

        pairs[a][b][tickSize] = pair;
        pairs[b][a][tickSize] = pair;
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
