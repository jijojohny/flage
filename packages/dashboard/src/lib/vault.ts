import { ethers } from 'ethers';
import { VAULT_ABI } from './abi';
import type { TradeEvent, VaultStats, TEEInfo } from './types';

// Known pair hashes → labels (populated from config)
const PAIR_LABELS: Record<string, string> = {
  [ethers.keccak256(ethers.toUtf8Bytes('ETH/USDC'))]: 'ETH/USDC',
  [ethers.keccak256(ethers.toUtf8Bytes('BTC/USDC'))]: 'BTC/USDC',
  [ethers.keccak256(ethers.toUtf8Bytes('ETH/USDT'))]: 'ETH/USDT',
  [ethers.keccak256(ethers.toUtf8Bytes('BTC/USDT'))]: 'BTC/USDT',
};

function labelPair(pairHash: string): string {
  return PAIR_LABELS[pairHash] ?? pairHash.slice(0, 10) + '…';
}

export function getProvider(): ethers.JsonRpcProvider {
  const url = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
  return new ethers.JsonRpcProvider(url);
}

export function getVaultContract(provider: ethers.Provider): ethers.Contract {
  const address = process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? '';
  if (!address) throw new Error('NEXT_PUBLIC_VAULT_ADDRESS not set');
  return new ethers.Contract(address, VAULT_ABI, provider);
}

export async function fetchVaultStats(vault: ethers.Contract): Promise<VaultStats> {
  const [totalTrades, realizedPnL] = await Promise.all([
    vault.totalTrades(),
    vault.realizedPnL(),
  ]);
  return {
    totalTrades,
    realizedPnL,
    address: await vault.getAddress(),
  };
}

export async function fetchTradeHistory(
  vault: ethers.Contract,
  provider: ethers.Provider,
  fromBlock = 0,
): Promise<TradeEvent[]> {
  const filter = vault.filters.TradeExecuted();
  const logs = await vault.queryFilter(filter, fromBlock);

  const events = await Promise.all(
    logs.map(async (log) => {
      const e = log as ethers.EventLog;
      let timestamp: number | undefined;
      try {
        const block = await provider.getBlock(e.blockNumber);
        timestamp = block?.timestamp;
      } catch {}

      return {
        pair: e.args[0] as string,
        pairLabel: labelPair(e.args[0] as string),
        action: Number(e.args[1]),
        amount: e.args[2] as bigint,
        nonce: e.args[3] as bigint,
        teeKey: e.args[4] as string,
        blockNumber: e.blockNumber,
        txHash: e.transactionHash,
        timestamp,
      } satisfies TradeEvent;
    }),
  );

  return events.sort((a, b) => b.blockNumber - a.blockNumber);
}

export async function fetchTEEInfo(
  vault: ethers.Contract,
  signingKey: string,
): Promise<TEEInfo> {
  const tee = await vault.teeRegistrations(signingKey);
  return {
    signingAddress: tee.signingAddress,
    tdxReportHash: tee.tdxReportHash,
    nvidiaReportHash: tee.nvidiaReportHash,
    registeredAt: tee.registeredAt,
    active: tee.active,
  };
}

export function formatAmount(amount: bigint, decimals = 18): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4);
  return `${whole.toLocaleString()}.${fracStr}`;
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
