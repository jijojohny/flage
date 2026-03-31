'use client';

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import type { WalletState } from '@/hooks/useWallet';
import type { TokenInfo, TxStatus } from '@/lib/types';
import { ERC20_ABI, VAULT_ABI } from '@/lib/abi';
import { TxFeedback } from './InvestPanel';
import { formatAddress } from '@/lib/vault';

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? '';

interface WithdrawPanelProps {
  wallet: WalletState;
  tokens: TokenInfo[];
}

interface VaultTokenBalance {
  token: TokenInfo;
  vaultBalance: bigint;
}

function formatUnits(value: bigint, decimals: number): string {
  const s = ethers.formatUnits(value, decimals);
  const n = parseFloat(s);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function parseUnits(value: string, decimals: number): bigint {
  try {
    return ethers.parseUnits(value || '0', decimals);
  } catch {
    return 0n;
  }
}

export function WithdrawPanel({ wallet, tokens }: WithdrawPanelProps) {
  const [selectedToken, setSelectedToken] = useState<TokenInfo>(tokens[0]);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [vaultBal, setVaultBal] = useState<VaultTokenBalance | null>(null);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus>({ state: 'idle' });

  const loadBalances = useCallback(async () => {
    if (!wallet.account || !wallet.provider || !selectedToken.address) return;
    try {
      const token = new ethers.Contract(selectedToken.address, ERC20_ABI, wallet.provider);
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet.provider);
      const [vaultBalance, owner] = await Promise.all([
        token.balanceOf(VAULT_ADDRESS),
        vault.owner(),
      ]);
      setIsOwner(owner.toLowerCase() === wallet.account.toLowerCase());
      setVaultBal({ token: selectedToken, vaultBalance });
    } catch {
      // ignore in dev
    }
  }, [wallet.account, wallet.provider, selectedToken]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  // default destination to connected wallet
  useEffect(() => {
    if (wallet.account && !destination) setDestination(wallet.account);
  }, [wallet.account, destination]);

  const parsedAmount = parseUnits(amount, selectedToken.decimals);
  const exceedsVault = vaultBal ? parsedAmount > vaultBal.vaultBalance : false;

  const handleWithdraw = async () => {
    if (!wallet.signer || !selectedToken.address || parsedAmount === 0n) return;
    const toAddr = destination.trim() || wallet.account!;
    if (!ethers.isAddress(toAddr)) {
      setTxStatus({ state: 'error', message: 'Invalid destination address' });
      return;
    }
    setTxStatus({ state: 'pending', hash: '' });
    try {
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet.signer);
      const tx = await vault.withdraw(selectedToken.address, parsedAmount, toAddr);
      setTxStatus({ state: 'pending', hash: tx.hash });
      await tx.wait();
      setAmount('');
      await loadBalances();
      setTxStatus({ state: 'confirmed', hash: tx.hash });
    } catch (e) {
      setTxStatus({ state: 'error', message: (e as Error).message });
    }
  };

  if (!wallet.account) {
    return (
      <div className="panel">
        <PanelHeader />
        <div className="empty-state">Connect your wallet to withdraw funds</div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ maxWidth: 520 }}>
      <PanelHeader />

      {isOwner === false && (
        <div className="notice notice-warn">
          Only the vault owner can withdraw funds. Your address ({formatAddress(wallet.account)}) is not the owner.
        </div>
      )}

      {/* Token selector */}
      <label className="field-label">Select Token</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {tokens.map(t => (
          <button
            key={t.symbol}
            className={selectedToken.symbol === t.symbol ? 'token-btn active' : 'token-btn'}
            onClick={() => { setSelectedToken(t); setAmount(''); setTxStatus({ state: 'idle' }); }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: t.logoColor, display: 'inline-block', marginRight: 6,
            }} />
            {t.symbol}
          </button>
        ))}
      </div>

      {/* Vault balance */}
      {vaultBal && (
        <div className="balance-row">
          <span className="balance-label">Vault Balance</span>
          <span className="balance-value">
            {formatUnits(vaultBal.vaultBalance, selectedToken.decimals)} {selectedToken.symbol}
          </span>
        </div>
      )}

      {/* Amount */}
      <label className="field-label">Amount to Withdraw</label>
      <div className="input-row">
        <input
          className="field-input"
          type="number"
          placeholder="0.00"
          value={amount}
          min="0"
          onChange={e => { setAmount(e.target.value); setTxStatus({ state: 'idle' }); }}
        />
        <button
          className="btn-ghost"
          style={{ flexShrink: 0 }}
          onClick={() => vaultBal && setAmount(ethers.formatUnits(vaultBal.vaultBalance, selectedToken.decimals))}
        >
          MAX
        </button>
      </div>
      {exceedsVault && <p className="field-error">Exceeds vault balance</p>}

      {/* Destination */}
      <label className="field-label" style={{ marginTop: 16 }}>Destination Address</label>
      <input
        className="field-input"
        type="text"
        placeholder="0x…"
        value={destination}
        onChange={e => setDestination(e.target.value)}
        style={{ marginBottom: 4 }}
      />
      <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 20 }}>
        Defaults to your connected wallet
      </p>

      <button
        className="btn-danger"
        onClick={handleWithdraw}
        disabled={
          !parsedAmount || parsedAmount === 0n ||
          exceedsVault ||
          txStatus.state === 'pending' ||
          isOwner === false
        }
      >
        {txStatus.state === 'pending' ? 'Withdrawing…' : 'Withdraw Funds'}
      </button>

      <TxFeedback status={txStatus} onDismiss={() => setTxStatus({ state: 'idle' })} />
    </div>
  );
}

function PanelHeader() {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
        Withdraw Funds
      </h2>
      <p style={{ fontSize: 12, color: 'var(--muted)' }}>
        Remove capital from the vault to your wallet
      </p>
    </div>
  );
}
