import { ethers } from 'ethers';
import { toast } from '../components/ui/use-toast';
import { VAULT_ABI, FACTORY_ABI, ROUTER_ABI } from '../contracts/contractData';
import { useEffect, useState } from 'react';
import { CONTRACT_ADDRESSES, validateContractAddresses } from '../lib/config';

type Contracts = {
    vault: ethers.Contract;
    factory: ethers.Contract;
    router: ethers.Contract;
} | null;

type LimitOrder = {
    maker: string;
    baseToken: string;
    quoteToken: string;
    baseAmount: bigint;
    price: bigint;
    isSellBase: boolean;
    expiry: bigint;
    nonce: bigint;
};

export const useContracts = (signer: ethers.Signer | null) => {
    const [ contracts, setContracts ] = useState<Contracts>(null);
    const [ loading, setLoading ] = useState<boolean>(false);

    useEffect (() => {
        if (signer) {
            // Validate contract addresses
            const validation = validateContractAddresses();
            if (!validation.isValid) {
                console.error('Contract addresses validation failed:', validation.errors);
                toast({
                    title: "Contract Configuration Error",
                    description: validation.errors.join(', '),
                    variant: "destructive"
                });
                setContracts(null);
                return;
            }

            try {
                const vault = new ethers.Contract(CONTRACT_ADDRESSES.VAULT, VAULT_ABI, signer);
                const factory = new ethers.Contract(CONTRACT_ADDRESSES.FACTORY, FACTORY_ABI, signer);
                const router = new ethers.Contract(CONTRACT_ADDRESSES.ROUTER, ROUTER_ABI, signer);

                setContracts({
                    vault,
                    factory,
                    router
                });
            } catch (error) {
                console.error('Error initializing contracts:', error);
                toast({
                    title: "Contract Initialization Error",
                    description: "Failed to initialize contracts",
                    variant: "destructive"
                });
                setContracts(null);
            }
        } else {
            setContracts(null);
        }
    }, [signer]);

    const handleTransaction = async (
        contractMethod: () => Promise<any>,
        successMessage: string,
        errorMessagePrefix: string
    ) => {
        try {
            setLoading(true);
            const tx = await contractMethod();
            await tx.wait();

            toast({
                title: "Transaction Successful",
                description: successMessage,
            });
            return tx;
        } catch (error) {
            console.error(`${errorMessagePrefix}:`, error);
            toast({
                title: "Transaction Failed",
                description: (error instanceof Error ? error.message : String(error)) || `Failed to ${errorMessagePrefix.toLowerCase()}`,
                variant: "destructive",
            });
            throw error;
        } finally {
            setLoading(false);
        }
    };

    // Place limit order function
    const placeLimitOrder = async (order: LimitOrder, signature: string = "0x") => {
        if (!contracts) throw new Error("Contracts not initialized");

        return handleTransaction(
            () => contracts.router.placeLimitOrder(order, signature),
            "Order placed successfully!",
            "Place order"
        );
    };

    // Cancel order function
    const cancelOrder = async (order: LimitOrder, signature: string = "0x") => {
        if (!contracts) throw new Error("Contracts not initialized");

        return handleTransaction(
            () => contracts.router.cancelOrder(order, signature),
            "Order cancelled successfully!",
            "Cancel order"
        );
    };

    // Get user nonce
    const getUserNonce = async (userAddress: string): Promise<bigint> => {
        if (!contracts) throw new Error("Contracts not initialized");
        return await contracts.router.getUserNonce(userAddress);
    };

    // Hash order for signing
    const hashOrder = async (order: LimitOrder): Promise<string> => {
        if (!contracts) throw new Error("Contracts not initialized");
        return await contracts.router.hashOrder(order);
    };

    // Get domain separator for EIP-712
    const getDomainSeparator = async (): Promise<string> => {
        if (!contracts) throw new Error("Contracts not initialized");
        return await contracts.router.domainSeparator();
    };

    return {
        contracts,
        loading,
        placeLimitOrder,
        cancelOrder,
        getUserNonce,
        hashOrder,
        getDomainSeparator,
        handleTransaction
    };
}
