/**
 * GET /api/stats
 * Server-side endpoint — reads vault stats without exposing RPC calls to the client.
 * Used for SSR data fetching and health checks.
 */
import { NextResponse } from 'next/server';
import { getProvider, getVaultContract, fetchVaultStats, fetchTradeHistory } from '@/lib/vault';

export const revalidate = 15; // ISR: revalidate every 15 seconds

export async function GET() {
  try {
    const provider = getProvider();
    const vault = getVaultContract(provider);

    const [stats, trades] = await Promise.all([
      fetchVaultStats(vault),
      fetchTradeHistory(vault, provider),
    ]);

    const buys = trades.filter(t => t.action === 0).length;
    const sells = trades.filter(t => t.action === 1).length;
    const uniqueTEEKeys = new Set(trades.map(t => t.teeKey)).size;

    return NextResponse.json({
      totalTrades: stats.totalTrades.toString(),
      realizedPnL: stats.realizedPnL.toString(),
      vaultAddress: stats.address,
      buys,
      sells,
      uniqueTEEKeys,
      latestBlock: trades[0]?.blockNumber ?? null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
