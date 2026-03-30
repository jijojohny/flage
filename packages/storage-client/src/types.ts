export interface TickData {
  source: string;
  pair: string;
  timestamp: bigint;
  bid: string;
  ask: string;
  bidSize: string;
  askSize: string;
  lastPrice: string;
  volume24h: string;
  blockNumber?: number;
  txHash?: string;
}

export interface OrderBookSnapshot {
  pair: string;
  timestamp: bigint;
  bids: [string, string][];
  asks: [string, string][];
  midPrice: string;
  spread: string;
  depth: {
    bid1pct: string;
    ask1pct: string;
  };
}

export interface ArbitrageSignal {
  id: string;
  strategyType: 'cross_dex' | 'triangular' | 'stat_arb';
  pairs: string[];
  venues: string[];
  expectedProfit: string;
  confidence: number;
  timestamp: bigint;
  expiresAt: bigint;
  inputData: {
    prices: Record<string, string>;
    volumes: Record<string, string>;
  };
}
