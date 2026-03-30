import { ethers } from 'ethers';
import { FLAGE_VAULT_ABI } from './abi';
import type { TradeReceipt } from './types';

export interface MonitorOptions {
  rpcUrl: string;
  vaultAddress: string;
  fromBlock?: number;
}

export interface TradeEvent {
  pair: string;
  action: number;
  amount: bigint;
  nonce: bigint;
  teeKey: string;
  blockNumber: number;
  txHash: string;
}

/**
 * VaultMonitor — listens to on-chain TradeExecuted events and
 * exposes a running P&L and trade history.
 */
export class VaultMonitor {
  private provider: ethers.JsonRpcProvider;
  private vault: ethers.Contract;
  private history: TradeEvent[] = [];
  private removeListener: (() => void) | null = null;

  constructor(opts: MonitorOptions) {
    this.provider = new ethers.JsonRpcProvider(opts.rpcUrl);
    this.vault = new ethers.Contract(
      ethers.getAddress(opts.vaultAddress),
      FLAGE_VAULT_ABI,
      this.provider,
    );
  }

  async start(onTrade?: (event: TradeEvent) => void): Promise<void> {
    // Replay historical events
    const filter = this.vault.filters.TradeExecuted();
    const past = await this.vault.queryFilter(filter);

    for (const log of past) {
      if (!('args' in log)) continue;
      const event = this._parseLog(log as ethers.EventLog);
      this.history.push(event);
    }

    console.log(`[Monitor] Loaded ${this.history.length} historical trades`);

    // Subscribe to new events
    const listener = (
      pair: string,
      action: number,
      amount: bigint,
      nonce: bigint,
      teeKey: string,
      log: ethers.EventLog,
    ) => {
      const event: TradeEvent = {
        pair,
        action,
        amount,
        nonce,
        teeKey,
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
      };
      this.history.push(event);
      console.log(
        `[Monitor] TradeExecuted — ${action === 0 ? 'BUY' : 'SELL'} nonce=${nonce} tx=${log.transactionHash}`,
      );
      onTrade?.(event);
    };

    this.vault.on(filter, listener);
    this.removeListener = () => this.vault.off(filter, listener);
  }

  stop(): void {
    this.removeListener?.();
    this.removeListener = null;
  }

  getHistory(): TradeEvent[] {
    return [...this.history];
  }

  getTotalTrades(): number {
    return this.history.length;
  }

  getTradesByTEE(teeKey: string): TradeEvent[] {
    return this.history.filter(
      e => e.teeKey.toLowerCase() === teeKey.toLowerCase(),
    );
  }

  getRecentTrades(n: number): TradeEvent[] {
    return this.history.slice(-n);
  }

  private _parseLog(log: ethers.EventLog): TradeEvent {
    return {
      pair: log.args[0] as string,
      action: Number(log.args[1]),
      amount: log.args[2] as bigint,
      nonce: log.args[3] as bigint,
      teeKey: log.args[4] as string,
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
    };
  }
}
