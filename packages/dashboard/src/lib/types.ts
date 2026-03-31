export interface TradeEvent {
  pair: string;           // bytes32 hex
  pairLabel: string;      // "ETH/USDC"
  action: number;         // 0=BUY, 1=SELL
  amount: bigint;
  nonce: bigint;
  teeKey: string;
  blockNumber: number;
  txHash: string;
  timestamp?: number;     // filled in from block
}

export interface VaultStats {
  totalTrades: bigint;
  realizedPnL: bigint;
  address: string;
}

export interface TEEInfo {
  signingAddress: string;
  tdxReportHash: string;
  nvidiaReportHash: string;
  registeredAt: bigint;
  active: boolean;
}

export interface PairConfig {
  tokenA: string;
  tokenB: string;
  maxPositionSize: bigint;
  maxDailyVolume: bigint;
  active: boolean;
}

export interface ChartDataPoint {
  time: string;
  buys: number;
  sells: number;
  volume: number;
}

export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
  logoColor: string; // accent color for the token badge
}

export interface VaultBalance {
  token: TokenInfo;
  vaultBalance: bigint;       // how much vault holds
  walletBalance: bigint;      // how much the connected wallet holds
  allowance: bigint;          // wallet's approved amount to vault
}

export type TxStatus =
  | { state: 'idle' }
  | { state: 'approving' }
  | { state: 'pending'; hash: string }
  | { state: 'confirmed'; hash: string }
  | { state: 'error'; message: string };

export type Tab = 'overview' | 'portfolio' | 'invest' | 'withdraw';
