'use client';

import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';

export interface WalletState {
  account: string | null;
  chainId: number | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  connecting: boolean;
  error: string | null;
}

const INITIAL_STATE: WalletState = {
  account: null,
  chainId: null,
  provider: null,
  signer: null,
  connecting: false,
  error: null,
};

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any;
  }
}

export function useWallet() {
  const [state, setState] = useState<WalletState>(INITIAL_STATE);

  const connect = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      setState(s => ({ ...s, error: 'No wallet detected. Please install MetaMask.' }));
      return;
    }
    setState(s => ({ ...s, connecting: true, error: null }));
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const account = await signer.getAddress();
      const network = await provider.getNetwork();
      setState({
        account,
        chainId: Number(network.chainId),
        provider,
        signer,
        connecting: false,
        error: null,
      });
    } catch (e) {
      setState(s => ({ ...s, connecting: false, error: (e as Error).message }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  // Auto-reconnect on mount if already authorised
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    window.ethereum
      .request({ method: 'eth_accounts' })
      .then((accounts: string[]) => {
        if (accounts.length > 0) connect();
      })
      .catch(() => {});

    const onAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) disconnect();
      else connect();
    };
    const onChainChanged = () => connect();

    window.ethereum.on('accountsChanged', onAccountsChanged);
    window.ethereum.on('chainChanged', onChainChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', onAccountsChanged);
      window.ethereum?.removeListener('chainChanged', onChainChanged);
    };
  }, [connect, disconnect]);

  return { ...state, connect, disconnect };
}
