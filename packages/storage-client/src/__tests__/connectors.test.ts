import { BinanceConnector } from '../connectors/binance';
import { DEXEventConnector } from '../connectors/dex';
import type { TickData } from '../types';

// ─── BinanceConnector ────────────────────────────────────────────────────────

// Minimal WebSocket mock
class MockWS {
  static instance: MockWS;
  handlers: Record<string, ((...args: any[]) => void)[]> = {};

  constructor(_url: string) { MockWS.instance = this; }

  on(event: string, cb: (...args: any[]) => void) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(cb);
  }

  emit(event: string, ...args: any[]) {
    this.handlers[event]?.forEach(cb => cb(...args));
  }

  close() { this.emit('close'); }
}

jest.mock('ws', () => MockWS);

describe('BinanceConnector', () => {
  let ticks: TickData[];
  let connector: BinanceConnector;

  beforeEach(() => {
    ticks = [];
    connector = new BinanceConnector(['ETH/USDC', 'BTC/USDC'], t => ticks.push(t));
  });

  afterEach(() => connector.disconnect());

  test('connect() opens WebSocket and registers handlers', () => {
    connector.connect();
    expect(MockWS.instance).toBeDefined();
    expect(MockWS.instance.handlers['message']).toBeDefined();
  });

  test('parses bookTicker message into TickData', () => {
    connector.connect();
    const msg = JSON.stringify({
      data: { s: 'ETHUSDC', b: '3000', a: '3001', B: '1.5', A: '2.0' },
    });
    MockWS.instance.emit('message', Buffer.from(msg));

    expect(ticks).toHaveLength(1);
    expect(ticks[0].source).toBe('binance');
    expect(ticks[0].pair).toBe('ETH/USDC');
    expect(ticks[0].bid).toBe('3000');
    expect(ticks[0].ask).toBe('3001');
    expect(typeof ticks[0].timestamp).toBe('bigint');
  });

  test('normalizes BTC/USDT pair symbol', () => {
    connector.connect();
    const msg = JSON.stringify({
      data: { s: 'BTCUSDT', b: '65000', a: '65001', B: '0.5', A: '0.5' },
    });
    MockWS.instance.emit('message', Buffer.from(msg));
    expect(ticks[0].pair).toBe('BTC/USDT');
  });

  test('ignores messages without data field', () => {
    connector.connect();
    MockWS.instance.emit('message', Buffer.from(JSON.stringify({ ping: 1 })));
    expect(ticks).toHaveLength(0);
  });

  test('ignores malformed JSON without throwing', () => {
    connector.connect();
    MockWS.instance.emit('message', Buffer.from('not json{{'));
    expect(ticks).toHaveLength(0);
  });

  test('disconnect() closes WebSocket', () => {
    connector.connect();
    const closeSpy = jest.spyOn(MockWS.instance, 'close');
    connector.disconnect();
    expect(closeSpy).toHaveBeenCalled();
  });
});

// ─── DEXEventConnector ───────────────────────────────────────────────────────

const mockContractOn = jest.fn();
const mockSlot0 = jest.fn().mockResolvedValue({
  sqrtPriceX96: BigInt('1461446703485210103287273052203988822378723970341'),
});
const mockRemoveAllListeners = jest.fn();

jest.mock('ethers', () => ({
  ethers: {
    WebSocketProvider: jest.fn(),
    Contract: jest.fn().mockImplementation(() => ({
      on: mockContractOn,
      slot0: mockSlot0,
      removeAllListeners: mockRemoveAllListeners,
    })),
  },
}));

describe('DEXEventConnector', () => {
  let ticks: TickData[];
  let connector: DEXEventConnector;

  const poolConfig = {
    address: '0xpool',
    pair: 'ETH/USDC',
    token0Decimals: 18,
    token1Decimals: 6,
  };

  beforeEach(() => {
    ticks = [];
    jest.clearAllMocks();
    connector = new DEXEventConnector('wss://rpc:8546', t => ticks.push(t));
  });

  test('listenToPool() registers a Swap listener', async () => {
    await connector.listenToPool(poolConfig);
    expect(mockContractOn).toHaveBeenCalledWith('Swap', expect.any(Function));
  });

  test('Swap event triggers onTick callback', async () => {
    await connector.listenToPool(poolConfig);
    const swapHandler = mockContractOn.mock.calls[0][1];
    // Simulate a swap event
    swapHandler(
      '0xsender', '0xrecipient',
      -1000000000000000000n, 3000000000n,
      BigInt('1461446703485210103287273052203988822378723970341'),
      5000000000000000000n,
      0,
    );
    expect(ticks).toHaveLength(1);
    expect(ticks[0].source).toBe('uniswap_v3');
    expect(ticks[0].pair).toBe('ETH/USDC');
  });

  test('getCurrentPrice() reads slot0 and returns a price string', async () => {
    const price = await connector.getCurrentPrice(poolConfig);
    expect(typeof price).toBe('string');
    expect(parseFloat(price)).toBeGreaterThan(0);
  });

  test('stopAll() removes all listeners and clears map', async () => {
    await connector.listenToPool(poolConfig);
    connector.stopAll();
    expect(mockRemoveAllListeners).toHaveBeenCalled();
  });
});
