import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { toast } from '../components/ui/use-toast';
import { ensureSwitchChain, NETWORK_CONFIG } from '../lib/config';

export const useWeb3 = () => {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [chainId, setChainId] = useState(null);

  const hydrate = async (bp) => {
    const accounts = await bp.listAccounts();
    if (!accounts?.length) return;
    const s = await bp.getSigner();
    const net = await bp.getNetwork();
    setProvider(bp);
    setSigner(s);
    setAccount(accounts[0].address);
    setIsConnected(true);
    setChainId(Number(net.chainId));
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        toast({ title: "MetaMask Not Found", description: "Please install MetaMask", variant: "destructive" });
        return;
      }
      await ensureSwitchChain(window.ethereum);
      const bp = new ethers.BrowserProvider(window.ethereum);
      await bp.send('eth_requestAccounts', []);
      await hydrate(bp);
      const addr = (await bp.listAccounts())?.[0]?.address;
      if (addr) toast({ title: "Connected", description: `${addr.slice(0,6)}...${addr.slice(-4)}` });
    } catch (e) {
      console.error(e);
      toast({ title: "Connection Failed", description: e?.message || "Failed to connect", variant: "destructive" });
    }
  };

  const requestAccountSwitch = async () => {
    try {
      if (!window.ethereum) return;
      await window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
      await ensureSwitchChain(window.ethereum);
      const bp = new ethers.BrowserProvider(window.ethereum);
      await hydrate(bp);
    } catch (e) {
      console.error(e);
      toast({ title: "Switch Failed", description: e?.message || "Failed to switch", variant: "destructive" });
    }
  };

  const disconnectWallet = () => {
    setProvider(null); setSigner(null); setAccount(null);
    setIsConnected(false); setChainId(null);
    toast({ title: "Disconnected" });
  };

  useEffect(() => {
    (async () => {
      if (!window.ethereum) return;
      try {
        await ensureSwitchChain(window.ethereum);
        const bp = new ethers.BrowserProvider(window.ethereum);
        const accs = await bp.listAccounts();
        if (accs?.length) await hydrate(bp);
      } catch {}
    })();

    const onAccounts = () => connectWallet();
    const onChain = () => connectWallet();
    window.ethereum?.on?.('accountsChanged', onAccounts);
    window.ethereum?.on?.('chainChanged', onChain);
    return () => {
      window.ethereum?.removeListener?.('accountsChanged', onAccounts);
      window.ethereum?.removeListener?.('chainChanged', onChain);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { provider, signer, account, isConnected, chainId, desiredChainId: NETWORK_CONFIG.CHAIN_ID, connectWallet, requestAccountSwitch, disconnectWallet };
};
