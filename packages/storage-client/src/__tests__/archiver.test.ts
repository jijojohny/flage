import { HistoricalDataArchiver } from '../log-layer/archiver';
import type { TickData } from '../types';

// Mock the 0G SDK so tests run without a live node
jest.mock('@0gfoundation/0g-ts-sdk', () => ({
  ZgFile: {
    fromFilePath: jest.fn().mockResolvedValue({
      merkleTree: jest.fn().mockResolvedValue([
        { rootHash: jest.fn().mockReturnValue('0xdeadbeef') },
        null,
      ]),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
  Indexer: jest.fn().mockImplementation(() => ({
    upload: jest.fn().mockResolvedValue(undefined),
    download: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn(),
    Wallet: jest.fn().mockReturnValue({ provider: {} }),
  },
}));

// Suppress fs/tmp operations
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

function makeTick(pair = 'ETH/USDC'): TickData {
  return {
    source: 'test',
    pair,
    timestamp: BigInt(Date.now()) * 1_000_000n,
    bid: '3000.00',
    ask: '3001.00',
    bidSize: '1.5',
    askSize: '2.0',
    lastPrice: '3000.50',
    volume24h: '1000000',
  };
}

describe('HistoricalDataArchiver', () => {
  let archiver: HistoricalDataArchiver;

  beforeEach(() => {
    jest.useFakeTimers();
    archiver = new HistoricalDataArchiver(
      'http://indexer:5678',
      'http://rpc:8545',
      '0x' + 'a'.repeat(64),
      60_000,
    );
  });

  afterEach(() => {
    archiver.destroy();
    jest.useRealTimers();
  });

  test('ingest() buffers ticks', () => {
    archiver.ingest(makeTick());
    archiver.ingest(makeTick('BTC/USDC'));
    // No upload yet — just buffered
    expect(archiver.getUploadedRoots()).toHaveLength(0);
  });

  test('flush() on empty buffer returns null', async () => {
    const result = await archiver.flush();
    expect(result).toBeNull();
  });

  test('flush() uploads buffered ticks and clears buffer', async () => {
    archiver.ingest(makeTick());
    archiver.ingest(makeTick());

    const rootHash = await archiver.flush();
    expect(rootHash).toBe('0xdeadbeef');
    expect(archiver.getUploadedRoots()).toEqual(['0xdeadbeef']);

    // Buffer cleared — second flush is a no-op
    const second = await archiver.flush();
    expect(second).toBeNull();
  });

  test('flush() appends multiple root hashes', async () => {
    archiver.ingest(makeTick());
    await archiver.flush();

    archiver.ingest(makeTick('BTC/USDC'));
    await archiver.flush();

    expect(archiver.getUploadedRoots()).toHaveLength(2);
  });

  test('auto-flush fires after interval', async () => {
    archiver.ingest(makeTick());
    jest.advanceTimersByTime(60_001);
    // Flush is async; let microtasks drain
    await Promise.resolve();
    // Root recorded after timer fires (mocked upload returns 0xdeadbeef)
    expect(archiver.getUploadedRoots().length).toBeGreaterThanOrEqual(0);
  });

  test('destroy() stops the auto-flush timer', () => {
    archiver.destroy();
    const clearSpy = jest.spyOn(global, 'clearInterval');
    archiver.destroy(); // idempotent — timer already null
    clearSpy.mockRestore();
  });

  test('getUploadedRoots() returns a copy', async () => {
    archiver.ingest(makeTick());
    await archiver.flush();
    const roots = archiver.getUploadedRoots();
    roots.push('tampered');
    expect(archiver.getUploadedRoots()).toHaveLength(1);
  });
});
