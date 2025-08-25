-include .env
export

# Test with gas report
test-gas:; forge test --gas-report

# Deploy individual contracts
deploy-vault:; forge script script/DeployVault.s.sol:DeployVault --account $(ACCOUNT) --rpc-url $(RPC_URL) --broadcast --gas-limit 50000000

deploy-factory:; forge script script/DeployClobFactory.s.sol:DeployClobFactory --account $(ACCOUNT) --rpc-url $(RPC_URL) --broadcast --gas-limit 50000000

deploy-router:; forge script script/DeployRouter.s.sol:DeployRouter --account $(ACCOUNT) --rpc-url $(RPC_URL) --broadcast --gas-limit 100000000 
