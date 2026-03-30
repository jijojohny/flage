import { ModelStorageClient } from '../model-storage/index';
import type { NormStats } from '../model-storage/index';

const mockSet = jest.fn();
const mockExec = jest.fn().mockResolvedValue(undefined);
const mockGetValue = jest.fn();
const mockUpload = jest.fn().mockResolvedValue(undefined);
const mockDownload = jest.fn().mockResolvedValue(undefined);

const MOCK_ROOT = '0xc0ffee';

jest.mock('@0gfoundation/0g-ts-sdk', () => ({
  ZgFile: {
    fromFilePath: jest.fn().mockResolvedValue({
      merkleTree: jest.fn().mockResolvedValue([
        { rootHash: jest.fn().mockReturnValue(MOCK_ROOT) },
        null,
      ]),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
  Indexer: jest.fn().mockImplementation(() => ({
    upload: mockUpload,
    download: mockDownload,
  })),
  KvClient: jest.fn().mockImplementation(() => ({
    getValue: mockGetValue,
  })),
  Batcher: jest.fn().mockImplementation(() => ({
    streamDataBuilder: { set: mockSet },
    exec: mockExec,
  })),
}));

jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn(),
    Wallet: jest.fn().mockReturnValue({}),
  },
}));

jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockImplementation(() => {
    // Return fake encrypted bytes: nonce(12) + tag(16) + ciphertext
    return Promise.resolve(Buffer.alloc(12 + 16 + 32, 0xaa));
  }),
}));

const NORM_STATS: NormStats = {
  mean: [0.1, 0.2, 0.3],
  std: [1.0, 1.0, 1.0],
  pairs: ['ETH/USDC', 'BTC/USDC'],
};

describe('ModelStorageClient', () => {
  let client: ModelStorageClient;
  const encKey = ModelStorageClient.generateKey();

  beforeEach(() => {
    jest.clearAllMocks();
    client = new ModelStorageClient(
      'http://indexer:5678',
      'http://kv:6789',
      'http://rpc:8545',
      '0x' + 'c'.repeat(64),
      '0xstream',
    );
  });

  // --- generateKey ---

  test('generateKey() returns 32 bytes', () => {
    const key = ModelStorageClient.generateKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  test('generateKey() returns different values each call', () => {
    const k1 = ModelStorageClient.generateKey();
    const k2 = ModelStorageClient.generateKey();
    expect(k1.equals(k2)).toBe(false);
  });

  // --- uploadModel ---

  test('uploadModel() writes three KV keys', async () => {
    const weights = Buffer.from('fake-torchscript-bytes');
    const result = await client.uploadModel(
      'flage-v1', '1.0.0', ['ETH/USDC'], weights, encKey, NORM_STATS,
    );

    expect(result.rootHash).toBe(MOCK_ROOT);
    expect(result.modelId).toBe('flage-v1');
    expect(mockSet).toHaveBeenCalledWith('model:weights:flage-v1', expect.any(Buffer));
    expect(mockSet).toHaveBeenCalledWith('model:meta:flage-v1', expect.any(Buffer));
    expect(mockSet).toHaveBeenCalledWith('model:norm:flage-v1', expect.any(Buffer));
    expect(mockExec).toHaveBeenCalledTimes(1);
  });

  test('uploadModel() includes normStatsHash in result', async () => {
    const weights = Buffer.from('weights');
    const result = await client.uploadModel(
      'flage-v2', '2.0.0', [], weights, encKey, NORM_STATS,
    );
    expect(typeof result.normStatsHash).toBe('string');
    expect(result.normStatsHash).toHaveLength(64); // sha256 hex
  });

  test('uploadModel() throws on wrong key length', async () => {
    await expect(
      client.uploadModel('x', '1.0', [], Buffer.from('w'), Buffer.alloc(16), NORM_STATS),
    ).rejects.toThrow('encKey must be 32 bytes');
  });

  // --- downloadModel ---

  test('downloadModel() calls download and returns buffer', async () => {
    mockGetValue.mockResolvedValueOnce(Buffer.from(MOCK_ROOT));

    // Use a real encrypt → decrypt round-trip via the private methods (via upload then download)
    // Here we just verify the flow doesn't throw and returns a Buffer
    const plaintext = Buffer.from('model-weights');
    const uploadResult = await client.uploadModel(
      'flage-dl', '1.0.0', [], plaintext, encKey, NORM_STATS,
    );

    // Mock download to write back what was "uploaded" (real encrypted bytes)
    const { readFile } = require('fs/promises');
    // The actual encrypt is called during uploadModel; re-use the same key for decrypt
    // Since fs mocks intercept both write and read, we need to simulate the encrypted payload
    mockGetValue.mockResolvedValueOnce(Buffer.from(uploadResult.rootHash));

    // We can't fully round-trip through the fs mock, so just verify it calls getValue + download
    const result = await client.downloadModel('flage-dl', encKey);
    expect(result).toBeInstanceOf(Buffer);
    expect(mockDownload).toHaveBeenCalled();
  });

  test('downloadModel() throws when model not found in KV', async () => {
    mockGetValue.mockResolvedValueOnce(null);
    await expect(client.downloadModel('not-found', encKey)).rejects.toThrow(
      'No weight record for model: not-found',
    );
  });

  test('downloadModel() throws on wrong key length', async () => {
    await expect(
      client.downloadModel('any', Buffer.alloc(16)),
    ).rejects.toThrow('encKey must be 32 bytes');
  });

  // --- getMetadata ---

  test('getMetadata() parses stored JSON', async () => {
    const meta = {
      modelId: 'flage-v1',
      version: '1.0.0',
      pairs: ['ETH/USDC'],
      uploadedAt: new Date().toISOString(),
      rootHash: MOCK_ROOT,
      encryptionScheme: 'AES-256-GCM',
      normStatsHash: 'abc123',
    };
    mockGetValue.mockResolvedValueOnce(Buffer.from(JSON.stringify(meta)));
    const result = await client.getMetadata('flage-v1');
    expect(result).toEqual(meta);
  });

  test('getMetadata() returns null when not found', async () => {
    mockGetValue.mockResolvedValueOnce(null);
    expect(await client.getMetadata('missing')).toBeNull();
  });

  // --- getNormStats ---

  test('getNormStats() parses stored JSON', async () => {
    mockGetValue.mockResolvedValueOnce(Buffer.from(JSON.stringify(NORM_STATS)));
    const result = await client.getNormStats('flage-v1');
    expect(result).toEqual(NORM_STATS);
  });

  test('getNormStats() returns null when not found', async () => {
    mockGetValue.mockResolvedValueOnce(null);
    expect(await client.getNormStats('missing')).toBeNull();
  });
});

// --- Encryption round-trip (pure unit test, no mocks needed) ---

describe('ModelStorageClient encryption', () => {
  test('encrypt → decrypt round-trip', () => {
    // Access private methods via any-cast
    const client = new ModelStorageClient(
      'http://a', 'http://b', 'http://c', '0x' + 'd'.repeat(64), '0xstream',
    ) as any;

    const key = ModelStorageClient.generateKey();
    const plaintext = Buffer.from('hello model weights');
    const encrypted = client._encrypt(plaintext, key);
    const decrypted = client._decrypt(encrypted, key);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  test('decrypt fails with wrong key', () => {
    const client = new ModelStorageClient(
      'http://a', 'http://b', 'http://c', '0x' + 'd'.repeat(64), '0xstream',
    ) as any;

    const key = ModelStorageClient.generateKey();
    const wrongKey = ModelStorageClient.generateKey();
    const encrypted = client._encrypt(Buffer.from('secret'), key);
    expect(() => client._decrypt(encrypted, wrongKey)).toThrow();
  });

  test('decrypt throws on truncated blob', () => {
    const client = new ModelStorageClient(
      'http://a', 'http://b', 'http://c', '0x' + 'd'.repeat(64), '0xstream',
    ) as any;

    const key = ModelStorageClient.generateKey();
    expect(() => client._decrypt(Buffer.alloc(10), key)).toThrow('Encrypted blob too short');
  });
});
