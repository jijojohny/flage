import { ethers } from 'ethers';
import type { TickData, OrderBookSnapshot } from '../types';

const UNISWAP_V3_POOL_ABI = [
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];

export interface PoolConfig {
  address: string;
  pair: string;      // e.g., "ETH/USDC"
  token0Decimals: number;
  token1Decimals: number;
}

export class DEXEventConnector {
  private provider: ethers.Provider;
  private onTick: (tick: TickData) => void;
  private listeners: Map<string, ethers.Contract> = new Map();

  constructor(rpcUrl: string, onTick: (tick: TickData) => void) {
    this.provider = new ethers.WebSocketProvider(rpcUrl);
    this.onTick = onTick;
  }

  async listenToPool(config: PoolConfig): Promise<void> {
    const pool = new ethers.Contract(config.address, UNISWAP_V3_POOL_ABI, this.provider);
    this.listeners.set(config.address, pool);

    pool.on('Swap', (sender, recipient, amount0, amount1, sqrtPriceX96) => {
      const price = this._sqrtPriceToPrice(
        sqrtPriceX96,
        config.token0Decimals,
        config.token1Decimals,
      );

      this.onTick({
        source: 'uniswap_v3',
        pair: config.pair,
        timestamp: BigInt(Date.now()) * 1_000_000n,
        bid: price.toString(),
        ask: price.toString(),
        bidSize: '0',
        askSize: '0',
        lastPrice: price.toString(),
        volume24h: '0',
      });
    });

    console.log(`[DEXConnector] Listening to ${config.pair} at ${config.address}`);
  }

  async getCurrentPrice(config: PoolConfig): Promise<string> {
    const pool = new ethers.Contract(config.address, UNISWAP_V3_POOL_ABI, this.provider);
    const slot0 = await pool.slot0();
    const price = this._sqrtPriceToPrice(
      slot0.sqrtPriceX96,
      config.token0Decimals,
      config.token1Decimals,
    );
    return price.toString();
  }

  stopAll(): void {
    for (const pool of this.listeners.values()) {
      pool.removeAllListeners();
    }
    this.listeners.clear();
  }

  private _sqrtPriceToPrice(
    sqrtPriceX96: bigint,
    token0Decimals: number,
    token1Decimals: number,
  ): number {
    const Q96 = 2n ** 96n;
    const price = Number(sqrtPriceX96 ** 2n) / Number(Q96 ** 2n);
    const decimalAdjust = 10 ** (token0Decimals - token1Decimals);
    return price * decimalAdjust;
  }
}
