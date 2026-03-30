export interface TradePayload {
  action: 0 | 1;        // 0=BUY, 1=SELL
  pair: string;         // keccak256 hex of "ETH/USDC"
  amount: bigint;       // 18 decimals
  priceLimit: bigint;   // 18 decimals
  deadline: number;     // Unix timestamp
  nonce: number;
  vault: string;        // checksum address
}

export interface SignedTrade {
  payload: TradePayload;
  payloadHash: string;
  signature: string;    // 65-byte hex
  signer: string;       // TEE public key address
}

export interface TradeReceipt {
  txHash: string;
  blockNumber: number;
  gasUsed: bigint;
  success: boolean;
  trade: SignedTrade;
  submittedAt: number;
}

export interface VaultStats {
  totalTrades: bigint;
  realizedPnL: bigint;
}

export interface TEERegistration {
  signingAddress: string;
  tdxReportHash: string;
  nvidiaReportHash: string;
  registeredAt: bigint;
  active: boolean;
}

export interface SettlementConfig {
  rpcUrl: string;
  vaultAddress: string;
  submitterPrivateKey: string;
  maxRetries?: number;
  retryDelayMs?: number;
  gasLimit?: number;
  confirmations?: number;
}
