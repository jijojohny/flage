'use client';

interface HeaderProps {
  lastUpdate: Date | null;
  onRefresh: () => void;
}

export function Header({ lastUpdate, onRefresh }: HeaderProps) {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--accent)',
          boxShadow: '0 0 8px var(--accent)',
        }} />
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.05em' }}>
          FLAGE
        </span>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>
          AI Arbitrage Protocol · 0G Chain
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {lastUpdate && (
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>
            Updated {lastUpdate.toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={onRefresh}
          style={{
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            padding: '4px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: 'var(--font)',
            fontSize: 12,
          }}
        >
          Refresh
        </button>
      </div>
    </header>
  );
}
