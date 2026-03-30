import { Batcher, KvClient, Indexer } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import type { OrderBookSnapshot, ArbitrageSignal, TickData } from '../types';

export class RealTimeDataServer {
  private kvClient: KvClient;
  private indexer: Indexer;
  private signer: ethers.Wallet;
  private streamId: string;

  constructor(
    kvNodeUrl: string,
    indexerUrl: string,
    rpcUrl: string,
    privateKey: string,
    streamId: string,
  ) {
    this.kvClient = new KvClient(kvNodeUrl);
    this.indexer = new Indexer(indexerUrl);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, provider);
    this.streamId = streamId;
  }

  // --- Writes ---

  async updateOrderBook(pair: string, snapshot: OrderBookSnapshot): Promise<void> {
    const batcher = new Batcher(1, [this.indexer], this.signer, this.streamId);
    const data = JSON.stringify({
      ...snapshot,
      timestamp: snapshot.timestamp.toString(),
    });

    batcher.streamDataBuilder.set(`orderbook:${pair}`, Buffer.from(data));
    batcher.streamDataBuilder.set(`price:${pair}`, Buffer.from(snapshot.midPrice));
    batcher.streamDataBuilder.set(`spread:${pair}`, Buffer.from(snapshot.spread));

    await batcher.exec();
  }

  async updatePrice(pair: string, price: string): Promise<void> {
    const batcher = new Batcher(1, [this.indexer], this.signer, this.streamId);
    batcher.streamDataBuilder.set(`price:${pair}`, Buffer.from(price));
    await batcher.exec();
  }

  async publishSignal(signal: ArbitrageSignal): Promise<void> {
    const batcher = new Batcher(1, [this.indexer], this.signer, this.streamId);
    const data = Buffer.from(JSON.stringify({
      ...signal,
      timestamp: signal.timestamp.toString(),
      expiresAt: signal.expiresAt.toString(),
    }));
    batcher.streamDataBuilder.set(`signal:${signal.strategyType}:${signal.id}`, data);
    batcher.streamDataBuilder.set(`opportunity:${signal.id}`, data);
    await batcher.exec();
  }

  // --- Reads ---

  async getOrderBook(pair: string): Promise<OrderBookSnapshot | null> {
    try {
      const raw = await this.kvClient.getValue(this.streamId, `orderbook:${pair}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw.toString());
      return { ...parsed, timestamp: BigInt(parsed.timestamp) };
    } catch {
      return null;
    }
  }

  async getPrice(pair: string): Promise<string | null> {
    try {
      const raw = await this.kvClient.getValue(this.streamId, `price:${pair}`);
      return raw ? raw.toString() : null;
    } catch {
      return null;
    }
  }

  async getSignal(strategyType: string, id: string): Promise<ArbitrageSignal | null> {
    try {
      const raw = await this.kvClient.getValue(
        this.streamId,
        `signal:${strategyType}:${id}`,
      );
      if (!raw) return null;
      const parsed = JSON.parse(raw.toString());
      return {
        ...parsed,
        timestamp: BigInt(parsed.timestamp),
        expiresAt: BigInt(parsed.expiresAt),
      };
    } catch {
      return null;
    }
  }

  async getLatestPrices(pairs: string[]): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    await Promise.all(
      pairs.map(async (pair) => {
        const price = await this.getPrice(pair);
        if (price) results[pair] = price;
      }),
    );
    return results;
  }
}
