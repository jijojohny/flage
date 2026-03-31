'use client';

import type { Tab } from '@/lib/types';
import type { WalletState } from '@/hooks/useWallet';
import { WalletConnect } from './WalletConnect';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',  label: 'Overview'  },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'invest',    label: 'Invest'    },
  { id: 'withdraw',  label: 'Withdraw'  },
];

interface HeaderProps {
  lastUpdate: Date | null;
  onRefresh: () => void;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  wallet: WalletState & { connect: () => void; disconnect: () => void };
}

export function Header({ lastUpdate, onRefresh, activeTab, onTabChange, wallet }: HeaderProps) {
  return (
    <header style={{
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 24px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--accent)',
            boxShadow: '0 0 8px var(--accent)',
            flexShrink: 0,
          }} />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.05em' }}>FLAGE</span>
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>
            AI Arbitrage Protocol · 0G Chain
          </span>
        </div>

        {/* Right side: last update + refresh + wallet */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastUpdate && (
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button className="btn-ghost" onClick={onRefresh} style={{ fontSize: 12 }}>
            Refresh
          </button>
          <WalletConnect wallet={wallet} />
        </div>
      </div>

      {/* Tab navigation */}
      <nav style={{
        display: 'flex',
        gap: 0,
        padding: '0 24px',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id
                ? '2px solid var(--accent)'
                : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--muted)',
              padding: '10px 18px',
              fontSize: 13,
              fontFamily: 'var(--font)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
