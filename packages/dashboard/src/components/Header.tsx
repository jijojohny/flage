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
      background: 'var(--bg)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        height: 52,
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 10,
            height: 10,
            background: 'var(--accent)',
            flexShrink: 0,
          }} />
          <span style={{
            fontWeight: 900,
            fontSize: 14,
            letterSpacing: '0.2em',
            color: 'var(--accent)',
            textTransform: 'uppercase',
          }}>
            FLAGE
          </span>
        </div>

        {/* Nav links + wallet */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {lastUpdate && (
            <span style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button className="btn-ghost" onClick={onRefresh} style={{ fontSize: 10, padding: '4px 10px' }}>
            Refresh
          </button>
          <WalletConnect wallet={wallet} />
        </div>
      </div>

      {/* Tab navigation */}
      <nav style={{
        display: 'flex',
        padding: '0 28px',
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
              padding: '12px 20px',
              fontSize: 11,
              fontFamily: 'var(--font)',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
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
