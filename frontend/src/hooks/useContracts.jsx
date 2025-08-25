// src/hooks/useContracts.jsx
import { ethers } from 'ethers';
import { toast } from '@/components/ui/use-toast';
import { VAULT_ABI, FACTORY_ABI, ROUTER_ABI } from '@/contracts/contractData';
import { useEffect, useState } from 'react';
import { CONTRACT_ADDRESSES, validateContractAddresses, NETWORK_CONFIG } from '@/lib/config';
import { createDomain, createLimitOrder, signLimitOrder, parseTokenAmount, validateOrder } from '@/lib/eip712';

const ERC20_ABI = [
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function nonces(address) view returns (uint256)"
];

const PAIR_ABI = [
  "function getPairInfo() view returns (address,address,uint256)",
  "function getBestBid() view returns (bool,uint256,uint64)",
  "function getBestAsk() view returns (bool,uint256,uint64)",
  "function getPriceLevel(uint256) view returns (uint64,uint64)",
  "function getUserOrders(address) view returns (bytes32[])",
  "function getOrderDetails(bytes32) view returns (bool,bool,uint256,uint64,address)"
];

const PERMIT_TYPES = {
  Permit: [
    { name: "owner",   type: "address" },
    { name: "spender", type: "address" },
    { name: "value",   type: "uint256" },
    { name: "nonce",   type: "uint256" },
    { name: "deadline",type: "uint256" }
  ]
};

const MAX_TICK_INDEX = 32767n;
const addrEq = (a, b) => a?.toLowerCase() === b?.toLowerCase();

export const useContracts = (signer) => {
  const [contracts, setContracts] = useState(null);
  const [loading, setLoading] = useState(false);

  // Initialize Router/Factory/Vault instances
  useEffect(() => {
    if (!signer) { setContracts(null); return; }
    const validation = validateContractAddresses();
    if (!validation.isValid) {
      toast({ title: "Contract Config Error", description: validation.errors.join(', '), variant: "destructive" });
      setContracts(null);
      return;
    }
    try {
      const vault = new ethers.Contract(CONTRACT_ADDRESSES.VAULT, VAULT_ABI, signer);
      const factory = new ethers.Contract(CONTRACT_ADDRESSES.FACTORY, FACTORY_ABI, signer);
      const router = new ethers.Contract(CONTRACT_ADDRESSES.ROUTER, ROUTER_ABI, signer);
      setContracts({ vault, factory, router });
    } catch (e) {
      console.error(e);
      toast({ title: "Init Failed", description: "Unable to init contracts", variant: "destructive" });
      setContracts(null);
    }
  }, [signer]);

  const handleTx = async (fn, okMsg) => {
    try {
      setLoading(true);
      const tx = await fn();
      await tx.wait();
      toast({ title: "Success", description: okMsg });
      return tx;
    } catch (e) {
      console.error(e);
      toast({ title: "Tx Failed", description: e?.message || "Transaction failed", variant: "destructive" });
      throw e;
    } finally {
      setLoading(false);
    }
  };

  // ----------------- basic utils -----------------
  const erc20 = (token, providerLike = signer) => new ethers.Contract(token, ERC20_ABI, providerLike);

  const getDecimals = async (token, providerLike) => {
    return Number(await erc20(token, providerLike).decimals());
  };

  const getAllPairs = async () => {
    if (!contracts?.factory) return [];
    return await contracts.factory.getAllPairs();
  };

  const getPairInfo = async (pairAddress, providerLike) => {
    const cp = new ethers.Contract(pairAddress, PAIR_ABI, signer || providerLike);
    const [base, quote, tick] = await cp.getPairInfo();
    return { base, quote, tickSize: BigInt(tick) };
  };

  const findMatchingPair = async (baseToken, quoteToken) => {
    const addrs = await getAllPairs();
    for (const p of addrs) {
      const { base, quote, tickSize } = await getPairInfo(p);
      if ((addrEq(base, baseToken) && addrEq(quote, quoteToken)) ||
          (addrEq(base, quoteToken) && addrEq(quote, baseToken))) {
        return { pair: p, pairBase: base, pairQuote: quote, tickSize };
      }
    }
    return null;
  };

  const getVaultAvailable = async (user, token) => {
    return BigInt(await contracts.vault.getAvailableBalance(user, token));
  };

  const tryDepositWithPermit = async (token, owner, amount, deadlineSec) => {
    // EIP-2612 single-tx funding: sign permit, then call depositWithPermit
    const tokenC = erc20(token);
    const [name, nonce, net] = await Promise.all([
      tokenC.name().catch(() => "Token"),
      tokenC.nonces(owner),
      signer.provider.getNetwork()
    ]);
    const domain = { name, version: "1", chainId: Number(net.chainId), verifyingContract: token };
    const msg = { owner, spender: CONTRACT_ADDRESSES.VAULT, value: amount.toString(), nonce: nonce.toString(), deadline: String(deadlineSec) };
    const signature = await signer.signTypedData(domain, PERMIT_TYPES, msg);
    const { r, s, v } = ethers.Signature.from(signature);
    await handleTx(
      () => contracts.vault.depositWithPermit(token, amount, deadlineSec, v, r, s),
      "Deposited to Vault via permit"
    );
  };

  const approveIfNeeded = async (token, owner, spender, amountNeeded) => {
    const c = erc20(token);
    const cur = BigInt(await c.allowance(owner, spender));
    if (cur >= amountNeeded) return;
    await handleTx(() => c.approve(spender, amountNeeded), "Approved token spend to Vault");
  };

  const depositToVault = async (token, owner, amount, { usePermit = false } = {}) => {
    const bal = BigInt(await erc20(token).balanceOf(owner));
    if (bal < amount) throw new Error(`Wallet balance too low for deposit. Need ${amount}, have ${bal}`);
    if (usePermit) {
      const deadline = Math.floor(Date.now()/1000) + 15 * 60;
      try { await tryDepositWithPermit(token, owner, amount, deadline); return; }
      catch (e) { console.warn("permit deposit failed, fallback approve+deposit:", e); }
    }
    await approveIfNeeded(token, owner, CONTRACT_ADDRESSES.VAULT, amount);
    await handleTx(() => contracts.vault.deposit(token, amount), "Deposited to Vault");
  };

  /** Replicate Router._findClobPairForPrice:
   * Filter candidate pairs by tokens, require price % tickSize == 0,
   * probe getPriceLevel(price) to ensure range/ABI match,
   * and pick the largest tickSize that divides price.
   */
  const pickPairForPrice = async (baseToken, quoteToken, price18) => {
    const all = await getAllPairs();
    let best = null;
    let bestTick = 0n;
    const candidates = [];

    for (const addr of all) {
      const info = await getPairInfo(addr);
      const matchTokens =
        (addrEq(info.base, baseToken) && addrEq(info.quote, quoteToken)) ||
        (addrEq(info.base, quoteToken) && addrEq(info.quote, baseToken));
      if (!matchTokens) continue;
      candidates.push({ addr, ...info });
    }

    if (!candidates.length) {
      throw new Error(`No deployed pair matches these tokens. Create pair first.`);
    }

    for (const c of candidates) {
      if (price18 % c.tickSize !== 0n) continue;
      try {
        const pair = new ethers.Contract(
          c.addr,
          ["function getPriceLevel(uint256) view returns (uint64,uint64)"],
          signer
        );
        await pair.getPriceLevel(price18);
        if (c.tickSize > bestTick) {
          bestTick = c.tickSize;
          best = c;
        }
      } catch (e) {
        console.warn(`getPriceLevel probe failed for pair ${c.addr} tick=${c.tickSize}:`, e);
      }
    }

    if (!best) {
      const ticks = candidates.map(c => c.tickSize.toString());
      throw new Error(
        `No pair accepts this price. Either price not aligned with tick, out of range, or ABI mismatch.\n` +
        `Available tickSizes: [${ticks.join(', ')}]`
      );
    }
    return best; // { addr, base, quote, tickSize }
  };

  // ----------------- place order -----------------
  /**
   * requireSignature: if true, sign EIP-712 (gasless/relayed scenarios).
   * autoFund: if true, auto top-up Vault when available balance < needed.
   * usePermit: when autoFund, try EIP-2612 permit first; fallback approve+deposit.
   * skipPreflight: if true, skip staticCall preflight.
   */
  const placeLimitOrder = async ({
    maker, baseToken, quoteToken,
    baseAmountHuman, baseDecimals,
    priceHuman, isSellBase,
    expirySec = 0,
    requireSignature = false,
    autoFund = true,
    usePermit = true,
    skipPreflight = false
  }) => {
    if (!contracts?.router) throw new Error("Router not ready");

    // Canonical pair check
    const match = await findMatchingPair(baseToken, quoteToken);
    if (!match) throw new Error("No matching pair on-chain for these token addresses.");
    if (!addrEq(baseToken, match.pairBase) || !addrEq(quoteToken, match.pairQuote)) {
      throw new Error(`Use canonical token order. base=${match.pairBase} quote=${match.pairQuote}`);
    }

    // Token support
    if (!(await contracts.vault.isSupportedToken(baseToken))) throw new Error("Base token not supported in Vault");
    if (!(await contracts.vault.isSupportedToken(quoteToken))) throw new Error("Quote token not supported in Vault");

    // Amounts & ticks
    const price18 = ethers.parseUnits(priceHuman, 18);
    const baseAmountRaw = parseTokenAmount(baseAmountHuman, baseDecimals);
    if (price18 % match.tickSize !== 0n) throw new Error(`Price must be a multiple of tickSize`);
    const tickIndex = price18 / match.tickSize;
    if (tickIndex > MAX_TICK_INDEX) throw new Error(`Price index too large`);

    // Choose the exact pair like Router would
    const chosen = await pickPairForPrice(baseToken, quoteToken, price18);

    // Ensure pair is authorized executor in Vault
    const isExec = await contracts.vault.isExecutor(chosen.addr);
    if (!isExec) {
      throw new Error(`Vault: chosen pair is NOT authorized executor. Authorize it first.\nPair: ${chosen.addr}`);
    }

    // Ensure Vault balance (optional auto-fund)
    const needToken = isSellBase ? baseToken : quoteToken;
    const needAmount = isSellBase ? baseAmountRaw : ((baseAmountRaw * price18) / 10n**18n);
    const available = await getVaultAvailable(maker, needToken);
    if (available < needAmount) {
      if (!autoFund) throw new Error(`Vault: insufficient balance. Need ${needAmount}, have ${available}`);
      const deficit = needAmount - available;
      await depositToVault(needToken, maker, deficit, { usePermit });
    }

    // Build order & signature
    const nonce = await contracts.router.getUserNonce(maker);
    const order = createLimitOrder({
      maker, baseToken, quoteToken,
      baseAmountRaw, priceHuman, isSellBase,
      expiry: expirySec, nonce
    });
    const { isValid, error } = validateOrder(order);
    if (!isValid) throw new Error(error);

    let sig = "0x";
    if (requireSignature) {
      const domain = createDomain(Number(NETWORK_CONFIG.CHAIN_ID), CONTRACT_ADDRESSES.ROUTER);
      sig = await signLimitOrder(signer, order, domain);
    }

    // Preflight (static call)
    if (!skipPreflight) {
      try {
        await contracts.router.placeLimitOrder.staticCall(order, sig);
      } catch (e) {
        const msg = e?.shortMessage || e?.message || 'revert';
        throw new Error(
          `Preflight failed.\n` +
          `pair=${chosen.addr}\n` +
          `tickSize=${chosen.tickSize} price=${price18}\n` +
          `Details: ${msg}`
        );
      }
    }

    // Send tx
    return await handleTx(() => contracts.router.placeLimitOrder(order, sig), "Order placed");
  };

  // ----------------- optional helpers -----------------
  const cancelOrder = async (order, signature = "0x") => {
    if (!contracts?.router) throw new Error("Router not ready");
    return await handleTx(() => contracts.router.cancelOrder(order, signature), "Order cancelled");
  };
  const cancelOrderByHash = async (orderHash) => {
    if (!contracts?.router) throw new Error("Router not ready");
    return await handleTx(() => contracts.router.cancelOrderByHash(orderHash), "Order cancelled");
  };

  const getBestBidAsk = async (pairAddress, providerLike) => {
    const cp = new ethers.Contract(pairAddress, PAIR_ABI, signer || providerLike);
    const [b1, bp, bq] = await cp.getBestBid();
    const [a1, ap, aq] = await cp.getBestAsk();
    return { bestBid: b1 ? { price: bp, qty: bq } : null, bestAsk: a1 ? { price: ap, qty: aq } : null };
  };

  const getPriceLevel = async (pairAddress, price, providerLike) => {
    const cp = new ethers.Contract(pairAddress, PAIR_ABI, signer || providerLike);
    return await cp.getPriceLevel(price);
  };

  const getUserOrders = async (pairAddress, user, providerLike) => {
    const cp = new ethers.Contract(pairAddress, PAIR_ABI, signer || providerLike);
    const hashes = await cp.getUserOrders(user);
    const details = [];
    for (const h of hashes) {
      const d = await cp.getOrderDetails(h);
      details.push({ hash: h, exists: d[0], isBid: d[1], price: d[2], remaining: d[3], maker: d[4] });
    }
    return details;
  };

  // Build full orderbook from SST snapshot
  const getOrderBookDepth = async (pairAddress, {
    startPrice = null,    // BigInt (wei, 18 decimals). If null -> 0
    endPrice = null,      // BigInt. If null -> tickSize * MAX_TICK_INDEX
    filterZero = true     // Remove levels that have both sides zero
  } = {}) => {
    if (!pairAddress) throw new Error("pairAddress required");
    const { base, quote, tickSize } = await getPairInfo(pairAddress);
    const pair = new ethers.Contract(pairAddress, [
      "function getSSTState(uint256,uint256) view returns (uint64[] bidValues, uint64[] askValues)",
      "function getPairInfo() view returns (address,address,uint256)"
    ], signer);

    const startP = startPrice !== null ? BigInt(startPrice) : 0n;
    const endP   = endPrice   !== null ? BigInt(endPrice)   : (tickSize * MAX_TICK_INDEX);

    const res = await pair.getSSTState(startP, endP);
    const bidArr = Array.from(res[0], v => BigInt(v));
    const askArr = Array.from(res[1], v => BigInt(v));

    const size = bidArr.length;
    const levels = [];
    for (let i = 0; i < size; i++) {
      const price = startP + (BigInt(i) * tickSize);
      const bidQty = bidArr[i];
      const askQty = askArr[i];
      if (filterZero && bidQty === 0n && askQty === 0n) continue;
      levels.push({ price, bidQty, askQty });
    }

    const bids = levels
      .filter(l => l.bidQty > 0n)
      .sort((a,b) => (a.price === b.price ? 0 : (a.price > b.price ? -1 : 1)));
    const asks = levels
      .filter(l => l.askQty > 0n)
      .sort((a,b) => (a.price === b.price ? 0 : (a.price > b.price ? 1 : -1)));

    return { baseToken: base, quoteToken: quote, tickSize, bids, asks };
  };

  return {
    contracts, loading,
    placeLimitOrder, cancelOrder, cancelOrderByHash,
    getAllPairs, getPairInfo, getBestBidAsk, getPriceLevel, getUserOrders, getDecimals, getOrderBookDepth
  };
};
