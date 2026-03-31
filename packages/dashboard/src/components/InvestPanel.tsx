'use client';

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import type { WalletState } from '@/hooks/useWallet';
import type { TokenInfo, VaultBalance, TxStatus } from '@/lib/types';
import { ERC20_ABI, VAULT_ABI } from '@/lib/abi';
import { formatAddress } from '@/lib/vault';

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? '';

interface InvestPanelProps {
  wallet: WalletState;
  tokens: TokenInfo[];
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

export function InvestPanel({ wallet, tokens }: InvestPanelProps) {
  const [selectedToken, setSelectedToken] = useState<TokenInfo>(tokens[0]);
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState<VaultBalance | null>(null);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus>({ state: 'idle' });

  const loadBalances = useCallback(async () => {
    if (!wallet.account || !wallet.provider || !selectedToken.address) return;
    try {
      const token = new ethers.Contract(selectedToken.address, ERC20_ABI, wallet.provider);
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet.provider);
      const [walletBal, vaultBal, allowance, owner] = await Promise.all([
        token.balanceOf(wallet.account),
        token.balanceOf(VAULT_ADDRESS),
        token.allowance(wallet.account, VAULT_ADDRESS),
        vault.owner(),
      ]);
      setIsOwner(owner.toLowerCase() === wallet.account.toLowerCase());
      setBalance({ token: selectedToken, walletBalance: walletBal, vaultBalance: vaultBal, allowance });
    } catch {
      // token may not be deployed in dev — ignore
    }
  }, [wallet.account, wallet.provider, selectedToken]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const parsedAmount = parseUnits(amount, selectedToken.decimals);
  const needsApproval = balance ? balance.allowance < parsedAmount && parsedAmount > 0n : false;
  const insufficientBalance = balance ? parsedAmount > balance.walletBalance : false;

  const handleApprove = async () => {
    if (!wallet.signer || !selectedToken.address) return;
    setTxStatus({ state: 'approving' });
    try {
      const token = new ethers.Contract(selectedToken.address, ERC20_ABI, wallet.signer);
      const tx = await token.approve(VAULT_ADDRESS, ethers.MaxUint256);
      setTxStatus({ state: 'pending', hash: tx.hash });
      await tx.wait();
      await loadBalances();
      setTxStatus({ state: 'idle' });
    } catch (e) {
      setTxStatus({ state: 'error', message: (e as Error).message });
    }
  };

  const handleDeposit = async () => {
    if (!wallet.signer || !selectedToken.address || parsedAmount === 0n) return;
    setTxStatus({ state: 'pending', hash: '' });
    try {
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet.signer);
      const tx = await vault.deposit(selectedToken.address, parsedAmount);
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
        <PanelHeader title="Deposit Funds" subtitle="Fund the vault to start AI trading" />
        <div className="empty-state">Connect your wallet to deposit funds</div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ maxWidth: 520 }}>
      <PanelHeader title="Deposit Funds" subtitle="Fund the vault to start AI-powered trading" />

      {isOwner === false && (
        <div className="notice notice-warn">
          Only the vault owner can deposit funds. Your address ({formatAddress(wallet.account)}) is not the owner.
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

      {/* Balance row */}
      {balance && (
        <div className="balance-row">
          <span className="balance-label">Wallet Balance</span>
          <span className="balance-value">
            {formatUnits(balance.walletBalance, selectedToken.decimals)} {selectedToken.symbol}
          </span>
        </div>
      )}

      {/* Amount input */}
      <label className="field-label">Amount</label>
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
          onClick={() => balance && setAmount(ethers.formatUnits(balance.walletBalance, selectedToken.decimals))}
        >
          MAX
        </button>
      </div>

      {insufficientBalance && (
        <p className="field-error">Insufficient {selectedToken.symbol} balance</p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        {needsApproval ? (
          <button
            className="btn-primary"
            onClick={handleApprove}
            disabled={txStatus.state === 'approving' || txStatus.state === 'pending'}
          >
            {txStatus.state === 'approving' ? 'Approving…' : `Approve ${selectedToken.symbol}`}
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={handleDeposit}
            disabled={
              !parsedAmount || parsedAmount === 0n ||
              insufficientBalance ||
              txStatus.state === 'pending' ||
              isOwner === false
            }
          >
            {txStatus.state === 'pending' ? 'Depositing…' : 'Deposit'}
          </button>
        )}
      </div>

      <TxFeedback status={txStatus} onDismiss={() => setTxStatus({ state: 'idle' })} />

      {/* Info box */}
      <div className="info-box" style={{ marginTop: 20 }}>
        <p>Deposited funds are managed by the Flage AI agent inside a TEE enclave.</p>
        <p style={{ marginTop: 6 }}>Every trade is cryptographically signed — verifiable on-chain.</p>
      </div>
    </div>
  );
}

/* ─── shared sub-components ───────────────────────────────────── */

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{title}</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)' }}>{subtitle}</p>
    </div>
  );
}

export function TxFeedback({ status, onDismiss }: { status: TxStatus; onDismiss: () => void }) {
  if (status.state === 'idle') return null;
  const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://chainscan-galileo.0g.ai';

  if (status.state === 'approving') {
    return <div className="tx-notice tx-pending">Waiting for approval signature…</div>;
  }
  if (status.state === 'pending') {
    return (
      <div className="tx-notice tx-pending">
        Transaction submitted.{' '}
        {status.hash && (
          <a href={`${explorerUrl}/tx/${status.hash}`} target="_blank" rel="noreferrer">
            View on explorer ↗
          </a>
        )}
      </div>
    );
  }
  if (status.state === 'confirmed') {
    return (
      <div className="tx-notice tx-confirmed" onClick={onDismiss} style={{ cursor: 'pointer' }}>
        Transaction confirmed!{' '}
        <a href={`${explorerUrl}/tx/${status.hash}`} target="_blank" rel="noreferrer">
          View ↗
        </a>
        {' · '}
        <span style={{ textDecoration: 'underline' }}>Dismiss</span>
      </div>
    );
  }
  if (status.state === 'error') {
    return (
      <div className="tx-notice tx-error" onClick={onDismiss} style={{ cursor: 'pointer' }}>
        Error: {status.message.slice(0, 120)} · <span style={{ textDecoration: 'underline' }}>Dismiss</span>
      </div>
    );
  }
  return null;
}
