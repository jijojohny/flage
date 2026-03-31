'use client';

import type { WalletState } from '@/hooks/useWallet';

const TARGET_CHAIN_ID = 16602;

interface WalletConnectProps {
  wallet: WalletState & { connect: () => void; disconnect: () => void };
}

export function WalletConnect({ wallet }: WalletConnectProps) {
  const { account, chainId, connecting, error, connect, disconnect } = wallet;
  const wrongChain = account && chainId !== TARGET_CHAIN_ID;

  if (!account) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {error && (
          <span style={{
            color: 'var(--red)',
            fontSize: 10,
            maxWidth: 180,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            {error.slice(0, 60)}
          </span>
        )}
        <button className="btn-primary" style={{ width: 'auto', padding: '7px 18px', fontSize: 10 }} onClick={connect} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {wrongChain && (
        <span style={{
          fontSize: 10,
          color: 'var(--red)',
          background: '#140707',
          border: '1px solid var(--red)',
          padding: '2px 8px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          Wrong network
        </span>
      )}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        border: '1px solid var(--border)',
        padding: '5px 12px',
      }}>
        <span style={{
          width: 6,
          height: 6,
          background: wrongChain ? 'var(--red)' : 'var(--green)',
          display: 'inline-block',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.04em' }}>
          {account.slice(0, 6)}…{account.slice(-4)}
        </span>
      </div>
      <button
        className="btn-ghost"
        onClick={disconnect}
        style={{ fontSize: 10, padding: '5px 10px' }}
      >
        Disconnect
      </button>
    </div>
  );
}
