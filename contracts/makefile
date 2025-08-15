-include .env
export

# Test with gas report
test-gas:; forge test --gas-report

# Deploy individual contracts
deploy-vault:; forge script script/DeployVault.s.sol:DeployVault --account $(ACCOUNT) --rpc-url $(RPC_URL) --broadcast --gas-limit 50000000

deploy-factory:; forge script script/DeployClobFactory.s.sol:DeployClobFactory --account $(ACCOUNT) --rpc-url $(RPC_URL) --broadcast --gas-limit 50000000

deploy-router:; forge script script/DeployRouter.s.sol:DeployRouter --account $(ACCOUNT) --rpc-url $(RPC_URL) --broadcast --gas-limit 100000000


# Deploy with verification
deploy-vault-verify:; forge script script/DeployVault.s.sol:DeployVault --account $(ACCOUNT) --rpc-url $(RPC_URL) --broadcast --verify --gas-limit 50000000

deploy-factory-verify:; forge script script/DeployClobFactory.s.sol:DeployClobFactory --account $(ACCOUNT) --rpc-url $(RPC_URL) --broadcast --verify --gas-limit 50000000

deploy-router-verify:; forge script script/DeployRouter.s.sol:DeployRouter --account $(ACCOUNT) --rpc-url $(RPC_URL) --broadcast --verify --gas-limit 100000000


# Help
help:; @echo "Available commands:"; @echo "  test-gas           - Run tests with gas report"; @echo "  deploy-vault       - Deploy Vault contract"; @echo "  deploy-factory     - Deploy ClobFactory contract"; @echo "  deploy-factory-optimized - Deploy optimized ClobFactory"; @echo "  deploy-router      - Deploy Router contract"; @echo "  deploy-*-verify    - Deploy with verification"
