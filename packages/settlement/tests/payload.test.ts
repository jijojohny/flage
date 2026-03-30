import { ethers } from 'ethers';
import {
  hashPayload,
  pairHash,
  recoverSigner,
  verifySigner,
  isExpired,
  buildPayload,
} from '../src/payload';
import type { TradePayload, SignedTrade } from '../src/types';

const VAULT = '0x1234567890123456789012345678901234567890';
const PAIR_STRING = 'ETH/USDC';

function makePayload(overrides: Partial<TradePayload> = {}): TradePayload {
  return {
    action: 0,
    pair: pairHash(PAIR_STRING),
    amount: ethers.parseEther('1'),
    priceLimit: ethers.parseEther('3000'),
    deadline: Math.floor(Date.now() / 1000) + 120,
    nonce: 0,
    vault: VAULT,
    ...overrides,
  };
}

function signPayload(payload: TradePayload, privateKey: string): SignedTrade {
  const hash = hashPayload(payload);
  const wallet = new ethers.Wallet(privateKey);
  // Sign synchronously via signMessageSync
  const sig = wallet.signingKey.sign(
    ethers.hashMessage(ethers.getBytes(hash)),
  );
  const signature = ethers.Signature.from(sig).serialized;
  return {
    payload,
    payloadHash: hash,
    signature,
    signer: wallet.address,
  };
}

describe('pairHash', () => {
  it('returns a 32-byte hex string', () => {
    const hash = pairHash(PAIR_STRING);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it('is deterministic', () => {
    expect(pairHash(PAIR_STRING)).toBe(pairHash(PAIR_STRING));
  });

  it('differs for different pairs', () => {
    expect(pairHash('ETH/USDC')).not.toBe(pairHash('BTC/USDC'));
  });
});

describe('hashPayload', () => {
  it('returns a 32-byte hex string', () => {
    const hash = hashPayload(makePayload());
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it('changes when any field changes', () => {
    const base = hashPayload(makePayload());
    expect(hashPayload(makePayload({ action: 1 }))).not.toBe(base);
    expect(hashPayload(makePayload({ nonce: 1 }))).not.toBe(base);
    expect(hashPayload(makePayload({ amount: ethers.parseEther('2') }))).not.toBe(base);
  });
});

describe('verifySigner / recoverSigner', () => {
  const wallet = ethers.Wallet.createRandom();

  it('recovers the correct signer', () => {
    const payload = makePayload();
    const signed = signPayload(payload, wallet.privateKey);
    expect(recoverSigner(signed).toLowerCase()).toBe(wallet.address.toLowerCase());
  });

  it('verifySigner returns true for valid signature', () => {
    const signed = signPayload(makePayload(), wallet.privateKey);
    expect(verifySigner(signed)).toBe(true);
  });

  it('verifySigner returns false when signer is wrong', () => {
    const other = ethers.Wallet.createRandom();
    const signed = signPayload(makePayload(), wallet.privateKey);
    const tampered: SignedTrade = { ...signed, signer: other.address };
    expect(verifySigner(tampered)).toBe(false);
  });
});

describe('isExpired', () => {
  it('returns false for future deadline', () => {
    const payload = makePayload({ deadline: Math.floor(Date.now() / 1000) + 300 });
    expect(isExpired(payload)).toBe(false);
  });

  it('returns true for past deadline', () => {
    const payload = makePayload({ deadline: Math.floor(Date.now() / 1000) - 10 });
    expect(isExpired(payload)).toBe(true);
  });

  it('respects buffer seconds', () => {
    const payload = makePayload({ deadline: Math.floor(Date.now() / 1000) + 3 });
    expect(isExpired(payload, 5)).toBe(true);
    expect(isExpired(payload, 0)).toBe(false);
  });
});

describe('buildPayload', () => {
  it('builds a valid payload', () => {
    const payload = buildPayload({
      action: 'BUY',
      pairString: 'ETH/USDC',
      amount: ethers.parseEther('1'),
      priceLimit: ethers.parseEther('3300'),
      deadlineOffsetSeconds: 120,
      nonce: 7,
      vault: VAULT,
    });

    expect(payload.action).toBe(0);
    expect(payload.nonce).toBe(7);
    expect(payload.pair).toBe(pairHash('ETH/USDC'));
    expect(payload.vault).toBe(ethers.getAddress(VAULT));
    expect(payload.deadline).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('maps SELL to action=1', () => {
    const payload = buildPayload({
      action: 'SELL',
      pairString: 'ETH/USDC',
      amount: 1n,
      priceLimit: 1n,
      deadlineOffsetSeconds: 60,
      nonce: 0,
      vault: VAULT,
    });
    expect(payload.action).toBe(1);
  });
});
