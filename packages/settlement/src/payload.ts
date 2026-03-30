import { ethers } from 'ethers';
import type { TradePayload, SignedTrade } from './types';

/**
 * Utility functions for encoding and hashing trade payloads,
 * matching the Solidity _hashPayload() in FlageVault exactly.
 */

export function hashPayload(payload: TradePayload): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['uint8', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256', 'address'],
      [
        payload.action,
        payload.pair,
        payload.amount,
        payload.priceLimit,
        payload.deadline,
        payload.nonce,
        payload.vault,
      ],
    ),
  );
}

export function pairHash(pairString: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(pairString));
}

export function recoverSigner(signed: SignedTrade): string {
  const ethSignedHash = ethers.hashMessage(ethers.getBytes(signed.payloadHash));
  return ethers.recoverAddress(ethSignedHash, signed.signature);
}

export function verifySigner(signed: SignedTrade): boolean {
  try {
    const recovered = recoverSigner(signed);
    return recovered.toLowerCase() === signed.signer.toLowerCase();
  } catch {
    return false;
  }
}

export function isExpired(payload: TradePayload, bufferSeconds = 5): boolean {
  return Math.floor(Date.now() / 1000) > payload.deadline - bufferSeconds;
}

export function buildPayload(opts: {
  action: 'BUY' | 'SELL';
  pairString: string;      // e.g. "ETH/USDC"
  amount: bigint;
  priceLimit: bigint;
  deadlineOffsetSeconds: number;
  nonce: number;
  vault: string;
}): TradePayload {
  return {
    action: opts.action === 'BUY' ? 0 : 1,
    pair: pairHash(opts.pairString),
    amount: opts.amount,
    priceLimit: opts.priceLimit,
    deadline: Math.floor(Date.now() / 1000) + opts.deadlineOffsetSeconds,
    nonce: opts.nonce,
    vault: ethers.getAddress(opts.vault),
  };
}
