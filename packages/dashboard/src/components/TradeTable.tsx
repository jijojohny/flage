'use client';

import type { TradeEvent } from '@/lib/types';
import { formatAmount, formatAddress } from '@/lib/vault';

interface TradeTableProps {
  trades: TradeEvent[];
}

const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://chainscan-galileo.0g.ai';

export function TradeTable({ trades }: TradeTableProps) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Trade History
        </span>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>{trades.length} trades</span>
      </div>

      <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              {['Nonce', 'Action', 'Pair', 'Amount', 'TEE Key', 'Block', 'Tx'].map(h => (
                <th key={h} style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  color: 'var(--muted)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  borderBottom: '1px solid var(--border)',
                  position: 'sticky',
                  top: 0,
                  background: 'var(--bg)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
                  No trades yet
                </td>
              </tr>
            )}
            {trades.map((t, i) => (
              <tr
                key={`${t.txHash}-${i}`}
                style={{
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>
                  {t.nonce.toString()}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{
                    color: t.action === 0 ? 'var(--green)' : 'var(--red)',
                    fontWeight: 700,
                    fontSize: 11,
                  }}>
                    {t.action === 0 ? 'BUY' : 'SELL'}
                  </span>
                </td>
                <td style={{ padding: '8px 12px' }}>{t.pairLabel}</td>
                <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>
                  {formatAmount(t.amount)}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>
                  <a
                    href={`${EXPLORER}/address/${t.teeKey}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {formatAddress(t.teeKey)}
                  </a>
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>
                  #{t.blockNumber.toLocaleString()}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <a
                    href={`${EXPLORER}/tx/${t.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 11 }}
                  >
                    {t.txHash.slice(0, 8)}…
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
