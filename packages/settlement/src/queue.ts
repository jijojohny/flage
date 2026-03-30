import { EventEmitter } from 'events';
import type { SignedTrade, TradeReceipt } from './types';
import { VaultClient, SettlementError } from './vault-client';

export interface QueueStats {
  pending: number;
  submitted: number;
  failed: number;
  totalGasUsed: bigint;
}

interface QueueEntry {
  trade: SignedTrade;
  addedAt: number;
}

/**
 * TradeQueue — accepts signed trades from the TEE agent, validates them,
 * and submits to the vault in order, with bounded concurrency.
 *
 * Events:
 *   'submitted' (receipt: TradeReceipt)
 *   'failed'    (error: SettlementError)
 *   'skipped'   (trade: SignedTrade, reason: string)
 */
export class TradeQueue extends EventEmitter {
  private queue: QueueEntry[] = [];
  private running = 0;
  private stopped = false;
  private stats: QueueStats = {
    pending: 0,
    submitted: 0,
    failed: 0,
    totalGasUsed: 0n,
  };

  constructor(
    private readonly client: VaultClient,
    private readonly concurrency = 1,
  ) {
    super();
  }

  enqueue(trade: SignedTrade): void {
    if (this.stopped) {
      console.warn('[Queue] Stopped — dropping trade nonce', trade.payload.nonce);
      return;
    }
    this.queue.push({ trade, addedAt: Date.now() });
    this.stats.pending++;
    this._drain();
  }

  enqueueBatch(trades: SignedTrade[]): void {
    trades.forEach(t => this.enqueue(t));
  }

  stop(): void {
    this.stopped = true;
  }

  resume(): void {
    this.stopped = false;
    this._drain();
  }

  getStats(): QueueStats {
    return { ...this.stats };
  }

  private _drain(): void {
    while (this.running < this.concurrency && this.queue.length > 0 && !this.stopped) {
      const entry = this.queue.shift()!;
      this.stats.pending--;
      this.running++;
      this._process(entry).finally(() => {
        this.running--;
        this._drain();
      });
    }
  }

  private async _process(entry: QueueEntry): Promise<void> {
    const { trade } = entry;

    // Pre-flight validation
    const { valid, reason } = await this.client.validateTrade(trade);
    if (!valid) {
      console.warn(`[Queue] Skipping nonce ${trade.payload.nonce}: ${reason}`);
      this.emit('skipped', trade, reason);
      return;
    }

    try {
      const receipt = await this.client.submitTrade(trade);
      this.stats.submitted++;
      this.stats.totalGasUsed += receipt.gasUsed;
      console.log(
        `[Queue] ✓ Trade settled — nonce=${trade.payload.nonce} tx=${receipt.txHash} gas=${receipt.gasUsed}`,
      );
      this.emit('submitted', receipt);
    } catch (err) {
      this.stats.failed++;
      const settlementErr =
        err instanceof SettlementError
          ? err
          : new SettlementError((err as Error).message, trade, err as Error);
      console.error(
        `[Queue] ✗ Trade failed — nonce=${trade.payload.nonce}: ${settlementErr.message}`,
      );
      this.emit('failed', settlementErr);
    }
  }
}
