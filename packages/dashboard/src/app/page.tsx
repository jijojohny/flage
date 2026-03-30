'use client';

import { useEffect, useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { StatCard } from '@/components/StatCard';
import { TradeTable } from '@/components/TradeTable';
import { TradeChart } from '@/components/TradeChart';
import { TEEStatus } from '@/components/TEEStatus';
import { Header } from '@/components/Header';
import {
  getProvider,
  getVaultContract,
  fetchVaultStats,
  fetchTradeHistory,
  fetchTEEInfo,
  formatAmount,
} from '@/lib/vault';
import type { TradeEvent, VaultStats, TEEInfo, ChartDataPoint } from '@/lib/types';

const TEE_KEY = process.env.NEXT_PUBLIC_TEE_KEY ?? '';
const POLL_INTERVAL = 15_000; // 15s

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
    b.volume += Number(t.amount / BigInt(10 ** 15)) / 1000; // rough ETH units
  }

  return Array.from(buckets.values()).slice(-14); // last 14 days
}

export default function DashboardPage() {
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
    <div style={{ minHeight: '100vh', padding: '0 0 48px' }}>
      <Header lastUpdate={lastUpdate} onRefresh={refresh} />

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

      {/* Stat cards */}
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

      {/* Chart */}
      <div style={{ padding: '24px 24px 0' }}>
        <TradeChart data={chartData} />
      </div>

      {/* Bottom row */}
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
  );
}
