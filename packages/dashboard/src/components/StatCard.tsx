'use client';

interface StatCardProps {
  label: string;
  value: string;
  color?: string;
}

export function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      padding: '20px 22px',
      transition: 'border-color 0.2s',
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{
        color: 'var(--muted)',
        fontSize: 10,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
      }}>
        / {label}
      </div>
      <div style={{
        fontSize: 26,
        fontWeight: 900,
        color: color ?? 'var(--accent)',
        letterSpacing: '-0.01em',
        lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  );
}
