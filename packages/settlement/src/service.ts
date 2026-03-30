/**
 * Settlement Service — entry point for running as a standalone process.
 *
 * Reads signed trade payloads from stdin (JSON lines) and submits them
 * to FlageVault. The TEE agent pipes its output here.
 *
 * Usage:
 *   python src/runner.py | node dist/service.js
 *
 * Or start it as a listener that accepts trades over a local IPC socket.
 */
import * as readline from 'readline';
import * as net from 'net';
import * as fs from 'fs';
import 'dotenv/config';

import { VaultClient } from './vault-client';
import { TradeQueue } from './queue';
import { VaultMonitor } from './monitor';
import { verifySigner, isExpired } from './payload';
import type { SignedTrade, SettlementConfig } from './types';

function loadConfig(): SettlementConfig {
  const required = ['OG_RPC_URL', 'VAULT_ADDRESS', 'SETTLEMENT_PRIVATE_KEY'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing env var: ${key}`);
  }
  return {
    rpcUrl: process.env['OG_RPC_URL']!,
    vaultAddress: process.env['VAULT_ADDRESS']!,
    submitterPrivateKey: process.env['SETTLEMENT_PRIVATE_KEY']!,
    maxRetries: Number(process.env['MAX_RETRIES'] ?? 3),
    retryDelayMs: Number(process.env['RETRY_DELAY_MS'] ?? 2000),
    gasLimit: Number(process.env['GAS_LIMIT'] ?? 350_000),
    confirmations: Number(process.env['CONFIRMATIONS'] ?? 1),
  };
}

function parseTrade(line: string): SignedTrade | null {
  try {
    return JSON.parse(line) as SignedTrade;
  } catch {
    console.error('[Service] Failed to parse trade JSON:', line.slice(0, 100));
    return null;
  }
}

function validateLocally(trade: SignedTrade): string | null {
  if (!verifySigner(trade)) return 'Signature does not match signer address';
  if (isExpired(trade.payload)) return 'Trade payload is expired';
  return null;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new VaultClient(config);
  const queue = new TradeQueue(client, 1); // serial submission

  // Wire queue events to logging
  queue.on('submitted', (receipt) => {
    console.log(`[Service] ✓ Settled  nonce=${receipt.trade.payload.nonce} tx=${receipt.txHash}`);
  });
  queue.on('failed', (err) => {
    console.error(`[Service] ✗ Failed   nonce=${err.trade.payload.nonce}: ${err.message}`);
  });
  queue.on('skipped', (trade, reason) => {
    console.warn(`[Service] ~ Skipped  nonce=${trade.payload.nonce}: ${reason}`);
  });

  // Start vault monitor
  const monitor = new VaultMonitor({
    rpcUrl: config.rpcUrl,
    vaultAddress: config.vaultAddress,
  });
  await monitor.start();

  // Print initial stats
  const stats = await client.getStats();
  console.log(`[Service] Vault loaded — totalTrades=${stats.totalTrades}`);

  // Determine input mode
  const mode = process.env['INPUT_MODE'] ?? 'stdin'; // 'stdin' | 'socket'

  if (mode === 'socket') {
    // IPC socket mode — listen for trades from the agent over a Unix socket
    const socketPath = process.env['SOCKET_PATH'] ?? '/tmp/flage-settlement.sock';
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);

    const server = net.createServer((conn) => {
      const rl = readline.createInterface({ input: conn });
      rl.on('line', (line) => {
        if (!line.trim()) return;
        const trade = parseTrade(line);
        if (!trade) return;
        const err = validateLocally(trade);
        if (err) {
          console.warn(`[Service] Local validation failed: ${err}`);
          return;
        }
        queue.enqueue(trade);
      });
    });

    server.listen(socketPath, () => {
      console.log(`[Service] Listening on socket ${socketPath}`);
    });

    process.on('SIGINT', () => {
      server.close();
      monitor.stop();
      process.exit(0);
    });
  } else {
    // Stdin mode — agent pipes JSON lines directly
    const rl = readline.createInterface({ input: process.stdin });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      const trade = parseTrade(line);
      if (!trade) return;
      const err = validateLocally(trade);
      if (err) {
        console.warn(`[Service] Local validation failed: ${err}`);
        return;
      }
      queue.enqueue(trade);
    });

    rl.on('close', () => {
      console.log('[Service] Stdin closed — draining queue...');
      // Give the queue time to finish submitting
      setTimeout(() => {
        const s = queue.getStats();
        console.log(
          `[Service] Done — submitted=${s.submitted} failed=${s.failed} gasUsed=${s.totalGasUsed}`,
        );
        monitor.stop();
        process.exit(0);
      }, 5000);
    });
  }

  // Periodic stats log every 60s
  setInterval(() => {
    const s = queue.getStats();
    console.log(
      `[Service] Stats — pending=${s.pending} submitted=${s.submitted} failed=${s.failed}`,
    );
  }, 60_000);
}

main().catch((err) => {
  console.error('[Service] Fatal error:', err);
  process.exit(1);
});
