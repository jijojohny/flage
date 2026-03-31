'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatCard }      from '@/components/StatCard';
import { TradeTable }    from '@/components/TradeTable';
import { TradeChart }    from '@/components/TradeChart';
import { TEEStatus }     from '@/components/TEEStatus';
import { Header }        from '@/components/Header';
import { InvestPanel }   from '@/components/InvestPanel';
import { WithdrawPanel } from '@/components/WithdrawPanel';
import { PortfolioPanel} from '@/components/PortfolioPanel';
import { useWallet }     from '@/hooks/useWallet';
import {
  getProvider, getVaultContract, fetchVaultStats,
  fetchTradeHistory, fetchTEEInfo, formatAmount,
} from '@/lib/vault';
import type { TradeEvent, VaultStats, TEEInfo, ChartDataPoint, Tab, TokenInfo } from '@/lib/types';

const TEE_KEY      = process.env.NEXT_PUBLIC_TEE_KEY ?? '';
const POLL_INTERVAL = 15_000;

const TOKENS: TokenInfo[] = [
  { symbol: 'USDC', address: process.env.NEXT_PUBLIC_USDC_ADDRESS ?? '', decimals: 6,  logoColor: '#2775ca' },
  { symbol: 'USDT', address: process.env.NEXT_PUBLIC_USDT_ADDRESS ?? '', decimals: 6,  logoColor: '#26a17b' },
  { symbol: 'WETH', address: process.env.NEXT_PUBLIC_WETH_ADDRESS ?? '', decimals: 18, logoColor: '#627eea' },
];

const TICKER_ITEMS = [
  'Trust', 'Integrity', 'Innovation', 'Security', 'Resilience',
  'Proof-of-Inference', 'Collaboration', 'Expertise', 'Transparency',
  'On-Chain', 'TEE-Verified', 'Zero Front-Running',
];

const FEATURES = [
  {
    icon: '⬡',
    title: 'TEE Enclave',
    desc: 'Model weights, strategy logic, and signing keys never leave the sealed CPU enclave. Hardware-rooted trust on Intel TDX.',
  },
  {
    icon: '◈',
    title: 'Proof of Inference',
    desc: 'Every trade is ECDSA-signed by a key born inside the enclave. Verifiable on-chain against a registered TEE attestation.',
  },
  {
    icon: '◎',
    title: 'Forensics & Audit',
    desc: 'Full on-chain audit trail via 0G Log Layer. Immutable tick history, Merkle-rooted and cryptographically verifiable.',
  },
];

function buildChartData(trades: TradeEvent[]): ChartDataPoint[] {
  const buckets = new Map<string, ChartDataPoint>();
  for (const t of [...trades].reverse()) {
    const date = t.timestamp
      ? new Date(t.timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : `Block ${t.blockNumber}`;
    if (!buckets.has(date)) buckets.set(date, { time: date, buys: 0, sells: 0, volume: 0 });
    const b = buckets.get(date)!;
    if (t.action === 0) b.buys++; else b.sells++;
    b.volume += Number(t.amount / BigInt(10 ** 15)) / 1000;
  }
  return Array.from(buckets.values()).slice(-14);
}

export default function DashboardPage() {
  const wallet = useWallet();
  const [activeTab,  setActiveTab]  = useState<Tab>('overview');
  const [stats,      setStats]      = useState<VaultStats | null>(null);
  const [trades,     setTrades]     = useState<TradeEvent[]>([]);
  const [teeInfo,    setTeeInfo]    = useState<TEEInfo | null>(null);
  const [chartData,  setChartData]  = useState<ChartDataPoint[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const provider = getProvider();
      const vault    = getVaultContract(provider);
      const [vaultStats, history] = await Promise.all([
        fetchVaultStats(vault), fetchTradeHistory(vault, provider),
      ]);
      setStats(vaultStats);
      setTrades(history);
      setChartData(buildChartData(history));
      setLastUpdate(new Date());
      setError(null);
      if (TEE_KEY) setTeeInfo(await fetchTEEInfo(vault, TEE_KEY));
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  const pnlPositive = stats && stats.realizedPnL >= 0n;

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* CRT scanlines overlay */}
      <div className="scanlines" />

      <Header
        lastUpdate={lastUpdate}
        onRefresh={refresh}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        wallet={wallet}
      />

      {error && (
        <div style={{
          margin: '0',
          padding: '10px 28px',
          background: '#140707',
          borderBottom: '1px solid var(--red)',
          color: 'var(--red)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          ⚠ RPC Error: {error}
        </div>
      )}

      {/* ════════════════════ LANDING SECTIONS (shown on overview) ════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* ── Hero ─────────────────────────────────────────────── */}
          <section style={{
            padding: '72px 28px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 40,
            maxWidth: 1200,
            margin: '0 auto',
          }}>
            <div style={{ flex: 1, maxWidth: 560 }}>
              <h1 className="heading-xl" style={{ marginBottom: 24 }}>
                No Front-Running,<br />Only Alpha.
              </h1>
              <p style={{
                fontSize: 12,
                color: 'var(--text-body)',
                maxWidth: 380,
                marginBottom: 32,
                lineHeight: 1.9,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                We deploy AI trading agents inside sealed TEE enclaves — provably fair, cryptographically verified, and unstoppable.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  className="btn-primary"
                  style={{ width: 'auto', padding: '12px 28px' }}
                  onClick={() => setActiveTab('invest')}
                >
                  Invest Now
                </button>
                <button
                  className="btn-outline"
                  style={{ padding: '12px 28px' }}
                  onClick={() => setActiveTab('portfolio')}
                >
                  View Portfolio
                </button>
              </div>
            </div>

            {/* Globe orb */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 8 }}>
              <div className="orb-container">
                <div className="orb" />
              </div>
            </div>
          </section>

          {/* ── Feature cards ─────────────────────────────────────── */}
          <section style={{
            padding: '0 28px',
            maxWidth: 1200,
            margin: '0 auto',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              borderTop: '1px solid var(--border)',
              borderLeft: '1px solid var(--border)',
            }}>
              {FEATURES.map(f => (
                <div
                  key={f.title}
                  className="feature-card"
                  style={{ borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}
                >
                  <div style={{
                    fontSize: 22,
                    color: 'var(--accent)',
                    marginBottom: 14,
                    opacity: 0.8,
                  }}>
                    {f.icon}
                  </div>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--accent)',
                    marginBottom: 10,
                  }}>
                    {f.title}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text-body)',
                    lineHeight: 1.8,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    {f.desc}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── About ─────────────────────────────────────────────── */}
          <section style={{
            padding: '80px 28px',
            maxWidth: 1200,
            margin: '0 auto',
            borderBottom: '1px solid var(--border)',
          }}>
            <p style={{
              fontSize: 10,
              color: 'var(--muted)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 24,
            }}>
              / About Flage
            </p>
            <h2 className="heading-lg" style={{ maxWidth: 840, lineHeight: 1.2 }}>
              We Deploy AI-Powered Trading Agents Inside Sealed Enclaves To Eliminate Front-Running And Information Leakage.
            </h2>
          </section>

          {/* ── Mission / Vision ──────────────────────────────────── */}
          <section style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            maxWidth: 1200,
            margin: '0 auto',
            borderBottom: '1px solid var(--border)',
          }}>
            {[
              {
                label: 'Mission',
                text: 'At Flage, our mission is to provide AI-driven trading infrastructure that operates with full cryptographic accountability, ensuring every trade decision is sealed inside a TEE and verifiable on-chain.',
              },
              {
                label: 'Vision',
                text: 'Our vision is to be the global standard for provably-fair algorithmic trading — creating a secure digital future for DeFi through TEE attestation, zero front-running, and resilience against manipulation.',
              },
            ].map((item, i) => (
              <div
                key={item.label}
                style={{
                  padding: '48px 32px',
                  borderRight: i === 0 ? '1px solid var(--border)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 240,
                }}
              >
                <p style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                  marginBottom: 48,
                }}>
                  / {item.label}
                </p>
                <p style={{
                  fontSize: 11,
                  color: 'var(--text-body)',
                  lineHeight: 1.9,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {item.text}
                </p>
              </div>
            ))}
          </section>

          {/* ── Ticker ────────────────────────────────────────────── */}
          <div className="ticker-wrap">
            <div className="ticker-track">
              {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
                <span key={i} className="ticker-item">
                  <span className="ticker-dot" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* ── Live Stats ────────────────────────────────────────── */}
          <section style={{ padding: '40px 28px 0', maxWidth: 1200, margin: '0 auto' }}>
            <p className="heading-sm" style={{ marginBottom: 20 }}>/ Live Vault Stats</p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 1,
              background: 'var(--border)',
            }}>
              <StatCard label="Total Trades"  value={stats ? stats.totalTrades.toString() : '—'} />
              <StatCard
                label="Realized P&L"
                value={stats ? `${pnlPositive ? '+' : ''}${formatAmount(stats.realizedPnL)} USDC` : '—'}
                color={stats ? (pnlPositive ? 'var(--green)' : 'var(--red)') : undefined}
              />
              <StatCard label="Vault" value={stats ? `${stats.address.slice(0,6)}…${stats.address.slice(-4)}` : '—'} />
              <StatCard label="Latest Block"  value={trades[0] ? `#${trades[0].blockNumber.toLocaleString()}` : '—'} />
            </div>
          </section>

          {/* ── Chart ─────────────────────────────────────────────── */}
          <section style={{ padding: '24px 28px 0', maxWidth: 1200, margin: '0 auto' }}>
            <p className="heading-sm" style={{ marginBottom: 16 }}>/ Trade Activity (14d)</p>
            <TradeChart data={chartData} />
          </section>

          {/* ── Trade table + TEE ─────────────────────────────────── */}
          <section style={{
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: 1,
            background: 'var(--border)',
            padding: '24px 28px 60px',
            maxWidth: 1200,
            margin: '0 auto',
          }}>
            <TradeTable trades={trades} />
            <TEEStatus info={teeInfo} teeKey={TEE_KEY} />
          </section>
        </>
      )}

      {/* ════════════════════ OTHER TABS ════════════════════ */}
      {activeTab === 'portfolio' && (
        <div style={{ padding: '40px 28px', maxWidth: 900, margin: '0 auto' }}>
          <p className="heading-sm" style={{ marginBottom: 24 }}>/ Portfolio</p>
          <PortfolioPanel wallet={wallet} tokens={TOKENS} stats={stats} trades={trades} />
        </div>
      )}

      {activeTab === 'invest' && (
        <div style={{ padding: '40px 28px', maxWidth: 600, margin: '0 auto' }}>
          <p className="heading-sm" style={{ marginBottom: 24 }}>/ Invest</p>
          <InvestPanel wallet={wallet} tokens={TOKENS} />
        </div>
      )}

      {activeTab === 'withdraw' && (
        <div style={{ padding: '40px 28px', maxWidth: 600, margin: '0 auto' }}>
          <p className="heading-sm" style={{ marginBottom: 24 }}>/ Withdraw</p>
          <WithdrawPanel wallet={wallet} tokens={TOKENS} />
        </div>
      )}
    </div>
  );
}
