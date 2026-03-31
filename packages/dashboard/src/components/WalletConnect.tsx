'use client';

import type { WalletState } from '@/hooks/useWallet';

const TARGET_CHAIN_ID = 16602; // 0G Galileo

interface WalletConnectProps {
  wallet: WalletState & { connect: () => void; disconnect: () => void };
}

export function WalletConnect({ wallet }: WalletConnectProps) {
  const { account, chainId, connecting, error, connect, disconnect } = wallet;

  const wrongChain = account && chainId !== TARGET_CHAIN_ID;

  if (!account) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {error && (
          <span style={{ color: 'var(--red)', fontSize: 11, maxWidth: 200 }}>
            {error}
          </span>
        )}
        <button className="btn-primary" onClick={connect} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {wrongChain && (
        <span style={{
          fontSize: 11,
          color: 'var(--red)',
          background: '#1a0808',
          border: '1px solid var(--red)',
          borderRadius: 4,
          padding: '2px 8px',
        }}>
          Wrong network — switch to 0G Galileo (16602)
        </span>
      )}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '4px 10px',
      }}>
        <span style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: wrongChain ? 'var(--red)' : 'var(--green)',
          display: 'inline-block',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font)' }}>
          {account.slice(0, 6)}…{account.slice(-4)}
        </span>
      </div>
      <button
        className="btn-ghost"
        onClick={disconnect}
        style={{ fontSize: 11, padding: '4px 8px' }}
      >
        Disconnect
      </button>
    </div>
  );
}
