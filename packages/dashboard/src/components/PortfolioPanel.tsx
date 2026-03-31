'use client';

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import type { WalletState } from '@/hooks/useWallet';
import type { TokenInfo, VaultStats, TradeEvent } from '@/lib/types';
import { ERC20_ABI } from '@/lib/abi';
import { formatAmount, formatAddress } from '@/lib/vault';

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? '';
const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://chainscan-galileo.0g.ai';

interface PortfolioPanelProps {
  wallet: WalletState;
  tokens: TokenInfo[];
  stats: VaultStats | null;
  trades: TradeEvent[];
}

interface TokenHolding {
  token: TokenInfo;
  balance: bigint;
}

function formatUnits(value: bigint, decimals: number): string {
  const s = ethers.formatUnits(value, decimals);
  const n = parseFloat(s);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function PortfolioPanel({ wallet, tokens, stats, trades }: PortfolioPanelProps) {
  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHoldings = useCallback(async () => {
    if (!wallet.provider) return;
    setLoading(true);
    try {
      const results = await Promise.all(
        tokens.map(async t => {
          if (!t.address) return { token: t, balance: 0n };
          const contract = new ethers.Contract(t.address, ERC20_ABI, wallet.provider!);
          const balance = await contract.balanceOf(VAULT_ADDRESS).catch(() => 0n);
          return { token: t, balance };
        }),
      );
      setHoldings(results);
    } finally {
      setLoading(false);
    }
  }, [wallet.provider, tokens]);

  useEffect(() => {
    loadHoldings();
  }, [loadHoldings]);

  const pnlPositive = stats ? stats.realizedPnL >= 0n : null;
  const totalTrades = stats ? Number(stats.totalTrades) : 0;
  const buys = trades.filter(t => t.action === 0).length;
  const sells = trades.filter(t => t.action === 1).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Vault holdings */}
      <div className="panel">
        <SectionHeader
          title="Vault Holdings"
          action={
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={loadHoldings}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          }
        />
        {holdings.length === 0 ? (
          <div className="empty-state">No token addresses configured</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {holdings.map(h => (
              <div key={h.token.symbol} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'var(--bg)',
                borderRadius: 6,
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: h.token.logoColor + '22',
                    border: `1px solid ${h.token.logoColor}55`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: h.token.logoColor,
                  }}>
                    {h.token.symbol.slice(0, 3)}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{h.token.symbol}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {formatAddress(h.token.address || '0x0000000000000000000000000000000000000000')}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {formatUnits(h.balance, h.token.decimals)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{h.token.symbol}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance stats */}
      <div className="panel">
        <SectionHeader title="Performance" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <StatBox
            label="Realized P&L"
            value={stats ? `${pnlPositive ? '+' : ''}${formatAmount(stats.realizedPnL)} USDC` : '—'}
            color={stats ? (pnlPositive ? 'var(--green)' : 'var(--red)') : 'var(--muted)'}
          />
          <StatBox label="Total Trades" value={totalTrades.toString()} />
          <StatBox label="Buy Orders" value={buys.toString()} color="var(--green)" />
          <StatBox label="Sell Orders" value={sells.toString()} color="var(--red)" />
        </div>
      </div>

      {/* Vault info */}
      <div className="panel">
        <SectionHeader title="Vault Info" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <InfoRow label="Vault Address">
            <a
              href={`${EXPLORER_URL}/address/${VAULT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12 }}
            >
              {VAULT_ADDRESS ? formatAddress(VAULT_ADDRESS) : '—'} ↗
            </a>
          </InfoRow>
          <InfoRow label="Network">
            <span style={{ fontSize: 12 }}>0G Galileo (Chain 16602)</span>
          </InfoRow>
          <InfoRow label="Latest Trade">
            {trades[0] ? (
              <a
                href={`${EXPLORER_URL}/tx/${trades[0].txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12 }}
              >
                Block #{trades[0].blockNumber.toLocaleString()} ↗
              </a>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>No trades yet</span>
            )}
          </InfoRow>
          {wallet.account && (
            <InfoRow label="Connected As">
              <span style={{ fontSize: 12 }}>{formatAddress(wallet.account)}</span>
            </InfoRow>
          )}
        </div>
      </div>

    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
      {action}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: '12px 14px',
      background: 'var(--bg)',
      borderRadius: 6,
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
      {children}
    </div>
  );
}
