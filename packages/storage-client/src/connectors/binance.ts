import WebSocket from 'ws';
import type { TickData } from '../types';

export class BinanceConnector {
  private ws: WebSocket | null = null;
  private onTick: (tick: TickData) => void;
  private pairs: string[];
  private reconnectMs = 5000;

  constructor(pairs: string[], onTick: (tick: TickData) => void) {
    this.pairs = pairs;
    this.onTick = onTick;
  }

  connect(): void {
    const streams = this.pairs
      .map(p => `${p.replace('/', '').toLowerCase()}@bookTicker`)
      .join('/');

    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => console.log('[Binance] Connected'));

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        const d = msg.data;
        if (!d) return;

        this.onTick({
          source: 'binance',
          pair: this._normalizePair(d.s),
          timestamp: BigInt(Date.now()) * 1_000_000n,
          bid: d.b,
          ask: d.a,
          bidSize: d.B,
          askSize: d.A,
          lastPrice: d.b,
          volume24h: '0',
        });
      } catch (e) {
        console.error('[Binance] Parse error:', e);
      }
    });

    this.ws.on('close', () => {
      console.warn('[Binance] Disconnected — reconnecting in %dms', this.reconnectMs);
      setTimeout(() => this.connect(), this.reconnectMs);
    });

    this.ws.on('error', (err) => console.error('[Binance] WS error:', err));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private _normalizePair(symbol: string): string {
    // "ETHUSDC" → "ETH/USDC"
    const stablecoins = ['USDC', 'USDT', 'BUSD', 'DAI'];
    for (const stable of stablecoins) {
      if (symbol.endsWith(stable)) {
        return `${symbol.slice(0, -stable.length)}/${stable}`;
      }
    }
    return symbol;
  }
}
