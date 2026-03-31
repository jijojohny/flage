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
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{
          fontWeight: 800,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--accent)',
        }}>
          / Trade History
        </span>
        <span style={{
          color: 'var(--muted)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          {trades.length} Trades
        </span>
      </div>

      <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              {['Nonce', 'Action', 'Pair', 'Amount', 'TEE Key', 'Block', 'Tx'].map(h => (
                <th key={h} style={{
                  padding: '9px 14px',
                  textAlign: 'left',
                  color: 'var(--muted)',
                  fontWeight: 600,
                  fontSize: 10,
                  whiteSpace: 'nowrap',
                  borderBottom: '1px solid var(--border)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
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
                <td colSpan={7} style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: 'var(--muted)',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}>
                  No trades yet
                </td>
              </tr>
            )}
            {trades.map((t, i) => (
              <tr
                key={`${t.txHash}-${i}`}
                style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <td style={{ padding: '9px 14px', color: 'var(--muted)' }}>
                  {t.nonce.toString()}
                </td>
                <td style={{ padding: '9px 14px' }}>
                  <span style={{
                    fontWeight: 800,
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    padding: '2px 8px',
                    border: `1px solid ${t.action === 0 ? 'var(--green)' : 'var(--red)'}`,
                    color: t.action === 0 ? 'var(--green)' : 'var(--red)',
                  }}>
                    {t.action === 0 ? 'BUY' : 'SELL'}
                  </span>
                </td>
                <td style={{ padding: '9px 14px', color: 'var(--accent)' }}>{t.pairLabel}</td>
                <td style={{ padding: '9px 14px', fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>
                  {formatAmount(t.amount)}
                </td>
                <td style={{ padding: '9px 14px', color: 'var(--muted)' }}>
                  <a href={`${EXPLORER}/address/${t.teeKey}`} target="_blank" rel="noreferrer">
                    {formatAddress(t.teeKey)}
                  </a>
                </td>
                <td style={{ padding: '9px 14px', color: 'var(--muted)' }}>
                  #{t.blockNumber.toLocaleString()}
                </td>
                <td style={{ padding: '9px 14px' }}>
                  <a
                    href={`${EXPLORER}/tx/${t.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 10, letterSpacing: '0.04em' }}
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
