import { ZgFile, Indexer } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { TickData } from '../types';

const DEFAULT_FLUSH_INTERVAL = 60_000; // 1 minute

export class HistoricalDataArchiver {
  private indexer: Indexer;
  private signer: ethers.Wallet;
  private buffer: TickData[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private uploadedRoots: string[] = [];

  private rpcUrl: string;

  constructor(
    indexerUrl: string,
    rpcUrl: string,
    privateKey: string,
    flushIntervalMs = DEFAULT_FLUSH_INTERVAL,
  ) {
    this.rpcUrl = rpcUrl;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, provider);
    this.indexer = new Indexer(indexerUrl);

    // Auto-flush on interval
    this.flushTimer = setInterval(() => this.flush(), flushIntervalMs);
  }

  ingest(tick: TickData): void {
    this.buffer.push(tick);
  }

  async flush(): Promise<string | null> {
    if (this.buffer.length === 0) return null;

    const batch = [...this.buffer];
    this.buffer = [];

    const rootHash = await this._uploadBatch(batch);
    if (rootHash) {
      this.uploadedRoots.push(rootHash);
      console.log(`[Archiver] Flushed ${batch.length} ticks → ${rootHash}`);
    }
    return rootHash;
  }

  private async _uploadBatch(ticks: TickData[]): Promise<string | null> {
    // Serialize to newline-delimited JSON (NDJSON)
    const ndjson = ticks
      .map(t => JSON.stringify({ ...t, timestamp: t.timestamp.toString() }))
      .join('\n');

    const tmpPath = path.join(os.tmpdir(), `flage_ticks_${Date.now()}.ndjson`);

    try {
      await fs.writeFile(tmpPath, ndjson, 'utf8');

      const file = await ZgFile.fromFilePath(tmpPath);
      const [tree, err] = await file.merkleTree();
      if (err) {
        console.error('[Archiver] Merkle tree error:', err);
        await file.close();
        return null;
      }

      const rootHash = tree.rootHash();
      await this.indexer.upload(file, this.rpcUrl, this.signer);
      await file.close();

      return rootHash;
    } catch (e) {
      console.error('[Archiver] Upload failed:', e);
      return null;
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
  }

  async downloadBatch(rootHash: string, outputPath: string): Promise<void> {
    await this.indexer.download(rootHash, outputPath, true);
  }

  getUploadedRoots(): string[] {
    return [...this.uploadedRoots];
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
  }
}
