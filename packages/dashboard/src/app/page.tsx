'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatCard } from '@/components/StatCard';
import { TradeTable } from '@/components/TradeTable';
import { TradeChart } from '@/components/TradeChart';
import { TEEStatus } from '@/components/TEEStatus';
import { Header } from '@/components/Header';
import { InvestPanel } from '@/components/InvestPanel';
import { WithdrawPanel } from '@/components/WithdrawPanel';
import { PortfolioPanel } from '@/components/PortfolioPanel';
import { useWallet } from '@/hooks/useWallet';
import {
  getProvider,
  getVaultContract,
  fetchVaultStats,
  fetchTradeHistory,
  fetchTEEInfo,
  formatAmount,
} from '@/lib/vault';
import type { TradeEvent, VaultStats, TEEInfo, ChartDataPoint, Tab, TokenInfo } from '@/lib/types';

const TEE_KEY = process.env.NEXT_PUBLIC_TEE_KEY ?? '';
const POLL_INTERVAL = 15_000;

// Configured tokens — set via env vars or fall back to empty address (UI handles gracefully)
const TOKENS: TokenInfo[] = [
  {
    symbol: 'USDC',
    address: process.env.NEXT_PUBLIC_USDC_ADDRESS ?? '',
    decimals: 6,
    logoColor: '#2775ca',
  },
  {
    symbol: 'USDT',
    address: process.env.NEXT_PUBLIC_USDT_ADDRESS ?? '',
    decimals: 6,
    logoColor: '#26a17b',
  },
  {
    symbol: 'WETH',
    address: process.env.NEXT_PUBLIC_WETH_ADDRESS ?? '',
    decimals: 18,
    logoColor: '#627eea',
  },
];

function buildChartData(trades: TradeEvent[]): ChartDataPoint[] {
  const buckets = new Map<string, ChartDataPoint>();
  for (const t of [...trades].reverse()) {
    const date = t.timestamp
      ? new Date(t.timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : `Block ${t.blockNumber}`;
    if (!buckets.has(date)) {
      buckets.set(date, { time: date, buys: 0, sells: 0, volume: 0 });
    }
    const b = buckets.get(date)!;
    if (t.action === 0) b.buys++;
    else b.sells++;
    b.volume += Number(t.amount / BigInt(10 ** 15)) / 1000;
  }
  return Array.from(buckets.values()).slice(-14);
}

export default function DashboardPage() {
  const wallet = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [trades, setTrades] = useState<TradeEvent[]>([]);
  const [teeInfo, setTeeInfo] = useState<TEEInfo | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const provider = getProvider();
      const vault = getVaultContract(provider);
      const [vaultStats, history] = await Promise.all([
        fetchVaultStats(vault),
        fetchTradeHistory(vault, provider),
      ]);
      setStats(vaultStats);
      setTrades(history);
      setChartData(buildChartData(history));
      setLastUpdate(new Date());
      setError(null);
      if (TEE_KEY) {
        const tee = await fetchTEEInfo(vault, TEE_KEY);
        setTeeInfo(tee);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  const pnlPositive = stats && stats.realizedPnL >= 0n;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 48 }}>
      <Header
        lastUpdate={lastUpdate}
        onRefresh={refresh}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        wallet={wallet}
      />

      {error && (
        <div style={{
          margin: '16px 24px',
          padding: '12px 16px',
          background: '#1a0a0a',
          border: '1px solid var(--red)',
          borderRadius: 6,
          color: 'var(--red)',
          fontSize: 12,
        }}>
          RPC Error: {error}
        </div>
      )}

      {/* ── Overview ── */}
      {activeTab === 'overview' && (
        <div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            padding: '24px 24px 0',
          }}>
            <StatCard
              label="Total Trades"
              value={stats ? stats.totalTrades.toString() : '—'}
            />
            <StatCard
              label="Realized P&L"
              value={stats ? `${pnlPositive ? '+' : ''}${formatAmount(stats.realizedPnL)} USDC` : '—'}
              color={stats ? (pnlPositive ? 'var(--green)' : 'var(--red)') : undefined}
            />
            <StatCard
              label="Vault"
              value={stats ? `${stats.address.slice(0, 6)}…${stats.address.slice(-4)}` : '—'}
            />
            <StatCard
              label="Latest Block"
              value={trades[0] ? `#${trades[0].blockNumber.toLocaleString()}` : '—'}
            />
          </div>

          <div style={{ padding: '24px 24px 0' }}>
            <TradeChart data={chartData} />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: 12,
            padding: '12px 24px 0',
          }}>
            <TradeTable trades={trades} />
            <TEEStatus info={teeInfo} teeKey={TEE_KEY} />
          </div>
        </div>
      )}

      {/* ── Portfolio ── */}
      {activeTab === 'portfolio' && (
        <div style={{ padding: '24px' }}>
          <PortfolioPanel
            wallet={wallet}
            tokens={TOKENS}
            stats={stats}
            trades={trades}
          />
        </div>
      )}

      {/* ── Invest ── */}
      {activeTab === 'invest' && (
        <div style={{ padding: '24px' }}>
          <InvestPanel wallet={wallet} tokens={TOKENS} />
        </div>
      )}

      {/* ── Withdraw ── */}
      {activeTab === 'withdraw' && (
        <div style={{ padding: '24px' }}>
          <WithdrawPanel wallet={wallet} tokens={TOKENS} />
        </div>
      )}
    </div>
  );
}
