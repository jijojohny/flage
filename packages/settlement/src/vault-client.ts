import { ethers } from 'ethers';
import { FLAGE_VAULT_ABI } from './abi';
import type { TradePayload, SignedTrade, TradeReceipt, VaultStats, TEERegistration, SettlementConfig } from './types';

const DEFAULT_GAS_LIMIT = 350_000;
const DEFAULT_CONFIRMATIONS = 1;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 2000;

export class VaultClient {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private vault: ethers.Contract;
  private config: Required<SettlementConfig>;

  constructor(config: SettlementConfig) {
    this.config = {
      maxRetries: DEFAULT_MAX_RETRIES,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
      gasLimit: DEFAULT_GAS_LIMIT,
      confirmations: DEFAULT_CONFIRMATIONS,
      ...config,
    };

    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.submitterPrivateKey, this.provider);
    this.vault = new ethers.Contract(
      ethers.getAddress(config.vaultAddress),
      FLAGE_VAULT_ABI,
      this.wallet,
    );
  }

  // --- Trade submission ---

  async submitTrade(signed: SignedTrade): Promise<TradeReceipt> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this._submit(signed);
      } catch (err) {
        lastError = err as Error;
        const msg = lastError.message ?? '';

        // Don't retry on contract revert errors — they won't change
        if (this._isRevert(msg)) {
          throw new SettlementError(this._parseRevert(msg), signed, lastError);
        }

        if (attempt < this.config.maxRetries) {
          console.warn(`[Settlement] Attempt ${attempt} failed, retrying in ${this.config.retryDelayMs}ms:`, msg);
          await sleep(this.config.retryDelayMs);
        }
      }
    }

    throw new SettlementError('Max retries exceeded', signed, lastError);
  }

  private async _submit(signed: SignedTrade): Promise<TradeReceipt> {
    const { payload } = signed;
    const submittedAt = Date.now();

    const tx = await this.vault.executeTrade(
      {
        action: payload.action,
        pair: payload.pair,
        amount: payload.amount,
        priceLimit: payload.priceLimit,
        deadline: payload.deadline,
        nonce: payload.nonce,
        vault: payload.vault,
      },
      signed.signature,
      { gasLimit: this.config.gasLimit },
    );

    const receipt = await tx.wait(this.config.confirmations);

    if (receipt.status !== 1) {
      throw new Error(`Transaction reverted: ${receipt.hash}`);
    }

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      success: true,
      trade: signed,
      submittedAt,
    };
  }

  // --- Batch submission ---

  async submitBatch(trades: SignedTrade[]): Promise<PromiseSettledResult<TradeReceipt>[]> {
    return Promise.allSettled(trades.map(t => this.submitTrade(t)));
  }

  // --- Validation before submission ---

  async validateTrade(signed: SignedTrade): Promise<{ valid: boolean; reason?: string }> {
    const { payload } = signed;

    // Check deadline
    if (Math.floor(Date.now() / 1000) > payload.deadline) {
      return { valid: false, reason: 'Trade has expired' };
    }

    // Check nonce not already used
    const nonceUsed = await this.vault.usedNonces(signed.signer, payload.nonce);
    if (nonceUsed) {
      return { valid: false, reason: `Nonce ${payload.nonce} already used` };
    }

    // Check TEE is registered and active
    const tee = await this.vault.teeRegistrations(signed.signer);
    if (tee.signingAddress === ethers.ZeroAddress) {
      return { valid: false, reason: `TEE key ${signed.signer} not registered` };
    }
    if (!tee.active) {
      return { valid: false, reason: `TEE key ${signed.signer} is deactivated` };
    }

    // Check pair is active
    const pair = await this.vault.pairs(payload.pair);
    if (!pair.active) {
      return { valid: false, reason: `Pair ${payload.pair} is not active` };
    }

    // Check position size
    if (payload.amount > pair.maxPositionSize) {
      return { valid: false, reason: `Amount exceeds max position size` };
    }

    return { valid: true };
  }

  // --- Stats ---

  async getStats(): Promise<VaultStats> {
    const [totalTrades, realizedPnL] = await Promise.all([
      this.vault.totalTrades(),
      this.vault.realizedPnL(),
    ]);
    return { totalTrades, realizedPnL };
  }

  async getTEERegistration(signingKey: string): Promise<TEERegistration> {
    const tee = await this.vault.teeRegistrations(signingKey);
    return {
      signingAddress: tee.signingAddress,
      tdxReportHash: tee.tdxReportHash,
      nvidiaReportHash: tee.nvidiaReportHash,
      registeredAt: tee.registeredAt,
      active: tee.active,
    };
  }

  // --- Event listener ---

  onTradeExecuted(
    callback: (pair: string, action: number, amount: bigint, nonce: bigint, teeKey: string) => void,
  ): () => void {
    const filter = this.vault.filters.TradeExecuted();
    const listener = (pair: string, action: number, amount: bigint, nonce: bigint, teeKey: string) => {
      callback(pair, action, amount, nonce, teeKey);
    };
    this.vault.on(filter, listener);
    return () => { this.vault.off(filter, listener); };
  }

  // --- Helpers ---

  private _isRevert(msg: string): boolean {
    return (
      msg.includes('reverted') ||
      msg.includes('revert') ||
      msg.includes('CALL_EXCEPTION')
    );
  }

  private _parseRevert(msg: string): string {
    const knownErrors: Record<string, string> = {
      TradeExpired: 'Trade payload has expired',
      WrongVault: 'Payload vault address does not match this vault',
      TEENotRegistered: 'TEE signing key is not registered',
      TEEDeactivated_: 'TEE signing key has been deactivated',
      NonceUsed: 'Nonce has already been used',
      PairNotActive: 'Trading pair is not active',
      ExceedsPositionLimit: 'Trade size exceeds maximum position size',
      ExceedsDailyVolume: 'Trade would exceed daily volume limit',
    };

    for (const [selector, description] of Object.entries(knownErrors)) {
      if (msg.includes(selector)) return description;
    }
    return `Contract reverted: ${msg}`;
  }
}

export class SettlementError extends Error {
  constructor(
    message: string,
    public readonly trade: SignedTrade,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'SettlementError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
