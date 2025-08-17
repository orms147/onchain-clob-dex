import { ethers } from 'ethers';
import { toast } from '../components/ui/use-toast';
import { VAULT_ABI, FACTORY_ABI, ROUTER_ABI } from '../contracts/contractData';
import { useEffect, useState } from 'react';

type Contracts = {
    vault: ethers.Contract;
    factory: ethers.Contract;
    router: ethers.Contract;
} | null;

export const useContracts = (signer: ethers.Signer | null) => {
    const [ contracts, setContracts ] = useState<Contracts>(null);
    const [ loading, setLoading ] = useState<boolean>(false);

    useEffect (() => {
        if (signer) {
            const vatltAddress = process.env.VITE_VAULT_ADDRESS;
            if (!vatltAddress) {
                throw new Error('VITE_VAULT_ADDRESS environment variable is not defined');
            }
            const vault = new ethers.Contract(vatltAddress, VAULT_ABI, signer);
            
            const factoryAddress = process.env.VITE_FACTORY_ADDRESS;
            if(!factoryAddress) {
                throw new Error('VITE_FACTORY_ADDRESS environment variable is not defined');
            }
            console.log("Factory address:", factoryAddress);
            const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, signer);
            
            const routerAddress = process.env.VITE_ROUTER_ADDRESS;
            if(!routerAddress) {
                throw new Error('ROUTER_ADDRESS environment variable is not defined');
            }
            const router = new ethers.Contract(routerAddress, ROUTER_ABI, signer);

            setContracts({
                vault,
                factory,
                router
            });
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
        } catch (error) {
        console.error(`${errorMessagePrefix}:`, error);
        toast({
            title: "Transaction Failed",
            description: (error instanceof Error ? error.message : String(error)) || `Failed to ${errorMessagePrefix.toLowerCase()}`,
            variant: "destructive",
        });
        } finally {
            setLoading(false);
        }
    };

    
}
