/**
 * GET /api/trades?limit=50
 * Returns paginated trade history as JSON.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getProvider, getVaultContract, fetchTradeHistory } from '@/lib/vault';

export const revalidate = 15;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 500);

  try {
    const provider = getProvider();
    const vault = getVaultContract(provider);
    const trades = await fetchTradeHistory(vault, provider);

    const serialized = trades.slice(0, limit).map(t => ({
      ...t,
      amount: t.amount.toString(),
      nonce: t.nonce.toString(),
    }));

    return NextResponse.json({ trades: serialized, total: trades.length });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
