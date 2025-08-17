import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES, TOKEN_ADDRESSES, validateContractAddresses } from '../lib/config';
import { ROUTER_ABI, FACTORY_ABI, VAULT_ABI } from '../contracts/contractData';

/**
 * Test connection to contracts and validate setup
 */
export async function testContractConnection() {
  console.log('🔍 Testing contract connection...');
  
  // Validate addresses
  const validation = validateContractAddresses();
  if (!validation.isValid) {
    console.error('❌ Contract addresses validation failed:', validation.errors);
    return false;
  }
  
  try {
    // Connect to provider
    const provider = new ethers.JsonRpcProvider('http://localhost:8545');
    
    // Test network connection
    const network = await provider.getNetwork();
    console.log('✅ Connected to network:', network.name, 'Chain ID:', network.chainId.toString());
    
    // Test contract connections
    const router = new ethers.Contract(CONTRACT_ADDRESSES.ROUTER, ROUTER_ABI, provider);
    const factory = new ethers.Contract(CONTRACT_ADDRESSES.FACTORY, FACTORY_ABI, provider);
    const vault = new ethers.Contract(CONTRACT_ADDRESSES.VAULT, VAULT_ABI, provider);
    
    // Test contract calls
    console.log('📋 Testing contract calls...');
    
    try {
      const domainSeparator = await router.domainSeparator();
      console.log('✅ Router domain separator:', domainSeparator);
    } catch (error) {
      console.error('❌ Router call failed:', error.message);
      return false;
    }
    
    try {
      const factoryVault = await factory.vault();
      console.log('✅ Factory vault address:', factoryVault);
      
      if (factoryVault.toLowerCase() !== CONTRACT_ADDRESSES.VAULT.toLowerCase()) {
        console.warn('⚠️ Factory vault address mismatch!');
        console.warn('Expected:', CONTRACT_ADDRESSES.VAULT);
        console.warn('Got:', factoryVault);
      }
    } catch (error) {
      console.error('❌ Factory call failed:', error.message);
      return false;
    }
    
    try {
      const vaultOwner = await vault.owner();
      console.log('✅ Vault owner:', vaultOwner);
    } catch (error) {
      console.error('❌ Vault call failed:', error.message);
      return false;
    }
    
    // Test token addresses
    console.log('🪙 Token addresses:');
    Object.entries(TOKEN_ADDRESSES).forEach(([symbol, address]) => {
      console.log(`  ${symbol}: ${address}`);
    });
    
    console.log('✅ All contract connections successful!');
    return true;
    
  } catch (error) {
    console.error('❌ Contract connection test failed:', error);
    return false;
  }
}

/**
 * Test MetaMask connection
 */
export async function testMetaMaskConnection() {
  console.log('🦊 Testing MetaMask connection...');
  
  if (typeof window.ethereum === 'undefined') {
    console.error('❌ MetaMask not found');
    return false;
  }
  
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.listAccounts();
    
    if (accounts.length === 0) {
      console.log('⚠️ No accounts connected');
      return false;
    }
    
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const balance = await provider.getBalance(address);
    
    console.log('✅ MetaMask connected');
    console.log('  Address:', address);
    console.log('  Balance:', ethers.formatEther(balance), 'ETH');
    
    return true;
    
  } catch (error) {
    console.error('❌ MetaMask connection failed:', error);
    return false;
  }
}

/**
 * Run comprehensive test
 */
export async function runDiagnostics() {
  console.log('🚀 Running DEX diagnostics...');
  console.log('================================');
  
  const contractTest = await testContractConnection();
  const metaMaskTest = await testMetaMaskConnection();
  
  console.log('================================');
  console.log('📊 Diagnostics Summary:');
  console.log('  Contract Connection:', contractTest ? '✅ PASS' : '❌ FAIL');
  console.log('  MetaMask Connection:', metaMaskTest ? '✅ PASS' : '❌ FAIL');
  
  if (contractTest && metaMaskTest) {
    console.log('🎉 All systems ready!');
  } else {
    console.log('⚠️ Some issues detected. Check logs above.');
  }
  
  return contractTest && metaMaskTest;
}

// Auto-run diagnostics in development
if (import.meta.env.DEV) {
  // Run diagnostics after a short delay to ensure DOM is ready
  setTimeout(() => {
    runDiagnostics();
  }, 2000);
}
