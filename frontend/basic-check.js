// BASIC CHECK - Minimal script to avoid RPC errors
// Copy paste vào browser console

console.clear();
console.log('🔍 === BASIC CONTRACT CHECK ===');

// Step 1: Check MetaMask
if (!window.ethereum) {
    console.log('❌ MetaMask not found');
} else {
    console.log('✅ MetaMask found');
}

// Step 2: Check if contracts are loaded
if (typeof window.contracts !== 'undefined') {
    console.log('✅ Window.contracts available');
    
    if (window.contracts.factory) {
        console.log('🏭 Factory:', window.contracts.factory.target);
    }
    
    if (window.contracts.router) {
        console.log('🚀 Router:', window.contracts.router.target);
    }
    
    if (window.contracts.vault) {
        console.log('🏦 Vault:', window.contracts.vault.target);
    }
} else {
    console.log('❌ Window.contracts not available');
    console.log('💡 Contracts may not be loaded yet');
}

// Step 3: Check ethers
if (typeof ethers !== 'undefined') {
    console.log('✅ Ethers.js available');
} else {
    console.log('❌ Ethers.js not available');
}

// Step 4: Basic provider test
async function basicProviderTest() {
    try {
        if (window.ethereum) {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const network = await provider.getNetwork();
            console.log('✅ Provider works, Network:', network.name, 'ChainId:', network.chainId.toString());
            
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            console.log('👤 Connected accounts:', accounts.length);
            if (accounts.length > 0) {
                console.log('   Current:', accounts[0]);
            }
        }
    } catch (e) {
        console.log('❌ Provider test failed:', e.message);
    }
}

basicProviderTest();

// Manual addresses for quick check
console.log('\n📋 === MANUAL CONTRACT ADDRESSES ===');
console.log('Copy these to check manually:');
console.log('Base Token:  0x33060d3fdd66A5B713f483d689A2C42d');
console.log('Quote Token: 0xf46c8c9774aD593fb61a85636b02f337');
console.log('Tick Size:   10000000000000000');
console.log('Pair Found:  0xD64e...6e7f (from your UI)');

console.log('\n🎯 === NEXT STEPS ===');
console.log('1. If contracts are loaded, try the simple debug script');
console.log('2. If RPC errors persist, check MetaMask network');
console.log('3. Try placing one more order to see if matching works');
