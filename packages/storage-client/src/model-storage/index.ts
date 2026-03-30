/**
 * ModelStorageClient
 *
 * Handles encrypted model weight storage on 0G:
 *   - Upload: encrypt bytes → upload to Log Layer → record root hash in KV Layer
 *   - Download: read root hash from KV Layer → download from Log Layer → return bytes
 *
 * Key naming convention in KV Layer:
 *   model:weights:<modelId>          → rootHash of the encrypted weight blob
 *   model:meta:<modelId>             → JSON ModelMetadata
 *   model:norm:<modelId>             → JSON normalisation stats (mean/std/pairs)
 */

import { ZgFile, Indexer, KvClient, Batcher } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface ModelMetadata {
  modelId: string;
  version: string;
  pairs: string[];
  uploadedAt: string;    // ISO timestamp
  rootHash: string;      // 0G Log Layer root hash
  encryptionScheme: 'AES-256-GCM';
  normStatsHash: string; // sha256 of the norm stats JSON
}

export interface NormStats {
  mean: number[];
  std: number[];
  pairs: string[];
}

export interface UploadResult {
  modelId: string;
  rootHash: string;
  normStatsHash: string;
}

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const KEY_BYTES = 32;

export class ModelStorageClient {
  private indexer: Indexer;
  private kvClient: KvClient;
  private signer: ethers.Wallet;
  private rpcUrl: string;
  private streamId: string;

  constructor(
    indexerUrl: string,
    kvNodeUrl: string,
    rpcUrl: string,
    privateKey: string,
    streamId: string,
  ) {
    this.rpcUrl = rpcUrl;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, provider);
    this.indexer = new Indexer(indexerUrl);
    this.kvClient = new KvClient(kvNodeUrl);
    this.streamId = streamId;
  }

  // ---------------------------------------------------------------------------
  // Upload
  // ---------------------------------------------------------------------------

  /**
   * Upload encrypted model weights to 0G Storage and record metadata in KV.
   *
   * @param modelId   Unique identifier (e.g. "flage-v1")
   * @param version   Semver string (e.g. "1.0.0")
   * @param pairs     Trading pairs the model covers
   * @param weights   Raw model weight bytes (TorchScript .pt file contents)
   * @param encKey    32-byte AES-256 key; caller owns and seals this in the TEE
   * @param normStats Normalisation statistics produced during training
   */
  async uploadModel(
    modelId: string,
    version: string,
    pairs: string[],
    weights: Buffer,
    encKey: Buffer,
    normStats: NormStats,
  ): Promise<UploadResult> {
    if (encKey.length !== KEY_BYTES) {
      throw new Error(`encKey must be ${KEY_BYTES} bytes, got ${encKey.length}`);
    }

    // 1. Encrypt weights
    const encrypted = this._encrypt(weights, encKey);

    // 2. Upload to Log Layer
    const rootHash = await this._uploadBytes(encrypted, `model_${modelId}_${version}`);
    if (!rootHash) throw new Error('0G upload returned null root hash');

    // 3. Hash norm stats
    const normJson = JSON.stringify(normStats);
    const normStatsHash = crypto.createHash('sha256').update(normJson).digest('hex');

    // 4. Write metadata + norm stats to KV Layer
    const meta: ModelMetadata = {
      modelId,
      version,
      pairs,
      uploadedAt: new Date().toISOString(),
      rootHash,
      encryptionScheme: 'AES-256-GCM',
      normStatsHash,
    };

    const batcher = new Batcher(1, [this.indexer], this.signer, this.streamId);
    batcher.streamDataBuilder.set(`model:weights:${modelId}`, Buffer.from(rootHash));
    batcher.streamDataBuilder.set(`model:meta:${modelId}`, Buffer.from(JSON.stringify(meta)));
    batcher.streamDataBuilder.set(`model:norm:${modelId}`, Buffer.from(normJson));
    await batcher.exec();

    console.log(`[ModelStorage] Uploaded ${modelId}@${version} → ${rootHash}`);
    return { modelId, rootHash, normStatsHash };
  }

  // ---------------------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------------------

  /**
   * Download and decrypt model weights from 0G Storage.
   *
   * @param modelId  Model identifier
   * @param encKey   32-byte AES-256 key used during upload
   * @returns        Decrypted weight bytes
   */
  async downloadModel(modelId: string, encKey: Buffer): Promise<Buffer> {
    if (encKey.length !== KEY_BYTES) {
      throw new Error(`encKey must be ${KEY_BYTES} bytes`);
    }

    const rootHash = await this._kvGet(`model:weights:${modelId}`);
    if (!rootHash) throw new Error(`No weight record for model: ${modelId}`);

    const encrypted = await this._downloadBytes(rootHash);
    return this._decrypt(encrypted, encKey);
  }

  async getMetadata(modelId: string): Promise<ModelMetadata | null> {
    const raw = await this._kvGet(`model:meta:${modelId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ModelMetadata;
  }

  async getNormStats(modelId: string): Promise<NormStats | null> {
    const raw = await this._kvGet(`model:norm:${modelId}`);
    if (!raw) return null;
    return JSON.parse(raw) as NormStats;
  }

  // ---------------------------------------------------------------------------
  // Key generation
  // ---------------------------------------------------------------------------

  /** Generate a fresh random 32-byte AES key. */
  static generateKey(): Buffer {
    return crypto.randomBytes(KEY_BYTES);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private _encrypt(plaintext: Buffer, key: Buffer): Buffer {
    const nonce = crypto.randomBytes(NONCE_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Wire format: nonce(12) || tag(16) || ciphertext
    return Buffer.concat([nonce, tag, ciphertext]);
  }

  private _decrypt(blob: Buffer, key: Buffer): Buffer {
    if (blob.length < NONCE_BYTES + 16) throw new Error('Encrypted blob too short');
    const nonce = blob.subarray(0, NONCE_BYTES);
    const tag = blob.subarray(NONCE_BYTES, NONCE_BYTES + 16);
    const ciphertext = blob.subarray(NONCE_BYTES + 16);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  private async _uploadBytes(data: Buffer, label: string): Promise<string | null> {
    const tmpPath = path.join(os.tmpdir(), `flage_${label}_${Date.now()}.bin`);
    try {
      await fs.writeFile(tmpPath, data);
      const file = await ZgFile.fromFilePath(tmpPath);
      const [tree, err] = await file.merkleTree();
      if (err) {
        console.error('[ModelStorage] Merkle tree error:', err);
        await file.close();
        return null;
      }
      const rootHash = tree.rootHash();
      await this.indexer.upload(file, this.rpcUrl, this.signer);
      await file.close();
      return rootHash;
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
  }

  private async _downloadBytes(rootHash: string): Promise<Buffer> {
    const tmpPath = path.join(os.tmpdir(), `flage_dl_${Date.now()}.bin`);
    try {
      await this.indexer.download(rootHash, tmpPath, true);
      return await fs.readFile(tmpPath);
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
  }

  private async _kvGet(key: string): Promise<string | null> {
    try {
      const raw = await this.kvClient.getValue(this.streamId, key);
      return raw ? raw.toString() : null;
    } catch {
      return null;
    }
  }
}
