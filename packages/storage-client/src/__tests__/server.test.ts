import { RealTimeDataServer } from '../kv-layer/server';
import type { OrderBookSnapshot, ArbitrageSignal } from '../types';

const mockSet = jest.fn();
const mockExec = jest.fn().mockResolvedValue(undefined);
const mockGetValue = jest.fn();

jest.mock('@0gfoundation/0g-ts-sdk', () => ({
  Batcher: jest.fn().mockImplementation(() => ({
    streamDataBuilder: { set: mockSet },
    exec: mockExec,
  })),
  KvClient: jest.fn().mockImplementation(() => ({
    getValue: mockGetValue,
  })),
  Indexer: jest.fn(),
}));

jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn(),
    Wallet: jest.fn().mockReturnValue({}),
  },
}));

const STREAM_ID = '0xstream';

function makeSnapshot(pair = 'ETH/USDC'): OrderBookSnapshot {
  return {
    pair,
    timestamp: BigInt(Date.now()),
    bids: [['3000', '1.0'], ['2999', '2.0']],
    asks: [['3001', '1.0'], ['3002', '2.0']],
    midPrice: '3000.50',
    spread: '1.00',
    depth: { bid1pct: '10000', ask1pct: '10000' },
  };
}

function makeSignal(): ArbitrageSignal {
  return {
    id: 'sig-001',
    strategyType: 'cross_dex',
    pairs: ['ETH/USDC'],
    venues: ['uniswap_v3', 'binance'],
    expectedProfit: '25.00',
    confidence: 0.87,
    timestamp: BigInt(Date.now()),
    expiresAt: BigInt(Date.now() + 5000),
    inputData: { prices: { 'ETH/USDC': '3000' }, volumes: { 'ETH/USDC': '50000' } },
  };
}

describe('RealTimeDataServer', () => {
  let server: RealTimeDataServer;

  beforeEach(() => {
    jest.clearAllMocks();
    server = new RealTimeDataServer(
      'http://kv:6789',
      'http://indexer:5678',
      'http://rpc:8545',
      '0x' + 'b'.repeat(64),
      STREAM_ID,
    );
  });

  // --- Writes ---

  test('updateOrderBook() writes orderbook, price and spread keys', async () => {
    await server.updateOrderBook('ETH/USDC', makeSnapshot());
    expect(mockSet).toHaveBeenCalledWith('orderbook:ETH/USDC', expect.any(Buffer));
    expect(mockSet).toHaveBeenCalledWith('price:ETH/USDC', expect.any(Buffer));
    expect(mockSet).toHaveBeenCalledWith('spread:ETH/USDC', expect.any(Buffer));
    expect(mockExec).toHaveBeenCalledTimes(1);
  });

  test('updatePrice() writes a single price key', async () => {
    await server.updatePrice('BTC/USDC', '65000.00');
    expect(mockSet).toHaveBeenCalledWith('price:BTC/USDC', Buffer.from('65000.00'));
    expect(mockExec).toHaveBeenCalledTimes(1);
  });

  test('publishSignal() writes signal and opportunity keys', async () => {
    await server.publishSignal(makeSignal());
    expect(mockSet).toHaveBeenCalledWith(
      'signal:cross_dex:sig-001',
      expect.any(Buffer),
    );
    expect(mockSet).toHaveBeenCalledWith('opportunity:sig-001', expect.any(Buffer));
    expect(mockExec).toHaveBeenCalledTimes(1);
  });

  // --- Reads ---

  test('getOrderBook() returns parsed snapshot', async () => {
    const snap = makeSnapshot();
    mockGetValue.mockResolvedValueOnce(
      Buffer.from(JSON.stringify({ ...snap, timestamp: snap.timestamp.toString() })),
    );
    const result = await server.getOrderBook('ETH/USDC');
    expect(result).not.toBeNull();
    expect(result!.pair).toBe('ETH/USDC');
    expect(result!.timestamp).toBe(snap.timestamp);
  });

  test('getOrderBook() returns null on missing key', async () => {
    mockGetValue.mockResolvedValueOnce(null);
    expect(await server.getOrderBook('XYZ/USDC')).toBeNull();
  });

  test('getPrice() returns price string', async () => {
    mockGetValue.mockResolvedValueOnce(Buffer.from('3050.00'));
    expect(await server.getPrice('ETH/USDC')).toBe('3050.00');
  });

  test('getPrice() returns null on missing key', async () => {
    mockGetValue.mockResolvedValueOnce(null);
    expect(await server.getPrice('MISSING')).toBeNull();
  });

  test('getSignal() returns parsed signal with BigInt fields', async () => {
    const sig = makeSignal();
    mockGetValue.mockResolvedValueOnce(
      Buffer.from(JSON.stringify({
        ...sig,
        timestamp: sig.timestamp.toString(),
        expiresAt: sig.expiresAt.toString(),
      })),
    );
    const result = await server.getSignal('cross_dex', 'sig-001');
    expect(result).not.toBeNull();
    expect(typeof result!.timestamp).toBe('bigint');
    expect(typeof result!.expiresAt).toBe('bigint');
  });

  test('getSignal() returns null on missing key', async () => {
    mockGetValue.mockResolvedValueOnce(null);
    expect(await server.getSignal('cross_dex', 'nope')).toBeNull();
  });

  test('getLatestPrices() fetches multiple pairs concurrently', async () => {
    mockGetValue
      .mockResolvedValueOnce(Buffer.from('3000'))
      .mockResolvedValueOnce(Buffer.from('65000'))
      .mockResolvedValueOnce(null);
    const prices = await server.getLatestPrices(['ETH/USDC', 'BTC/USDC', 'SOL/USDC']);
    expect(prices['ETH/USDC']).toBe('3000');
    expect(prices['BTC/USDC']).toBe('65000');
    expect(prices['SOL/USDC']).toBeUndefined();
  });

  test('read methods return null on KvClient errors', async () => {
    mockGetValue.mockRejectedValue(new Error('KV node unreachable'));
    expect(await server.getPrice('ETH/USDC')).toBeNull();
    expect(await server.getOrderBook('ETH/USDC')).toBeNull();
    expect(await server.getSignal('cross_dex', 'x')).toBeNull();
  });
});
