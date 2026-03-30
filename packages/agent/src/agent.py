"""
flage Trading Agent — runs inside TEE (Intel TDX + NVIDIA H100)
All inference and signing happens inside the sealed enclave.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass

import torch
from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3

logger = logging.getLogger(__name__)


@dataclass
class TradePayload:
    action: str          # "BUY" | "SELL"
    pair: str            # "ETH/USDC"
    amount: int          # in wei (18 decimals)
    price_limit: int     # in wei
    deadline: int        # Unix timestamp
    nonce: int
    vault: str           # checksum address


@dataclass
class SignedTrade:
    payload: TradePayload
    payload_hash: str
    signature: str
    signer: str


class FlageAgent:
    """
    TEE-resident trading agent.
    Key is generated at TEE boot and never leaves the enclave.
    """

    def __init__(
        self,
        model_path: str,
        config: dict,
        private_key: bytes | None = None,
    ):
        # Load TorchScript model (decrypted inside enclave)
        self.model = torch.jit.load(model_path, map_location="cuda")
        self.model.eval()

        # Enclave-born keypair
        if private_key:
            self.account = Account.from_key(private_key)
        else:
            # In production: use TEE hardware key generation API
            self.account = Account.create()
        self.public_key = self.account.address
        logger.info("TEE signing key: %s", self.public_key)

        self.vault_address = config["vault_address"]
        self.target_pairs = config["target_pairs"]
        self.max_position_size = int(config["max_position_size"])
        self.confidence_threshold = float(config.get("confidence_threshold", 0.70))
        self.max_drawdown = float(config.get("max_drawdown", 0.05))

        self._nonce = 0
        self._positions: dict[str, int] = {}

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    def process(self, orderbooks: dict, prices: dict) -> list[SignedTrade]:
        if not prices:
            return []

        features = self._extract_features(orderbooks, prices)
        tensor = torch.tensor(features, dtype=torch.float32).unsqueeze(0).cuda()

        with torch.no_grad():
            predictions = self.model(tensor)  # (1, num_pairs * 3)

        trades = self._decode(predictions.cpu().numpy()[0], prices)
        trades = self._risk_filter(trades)
        return [self._sign(t) for t in trades]

    def _extract_features(self, orderbooks: dict, prices: dict) -> list[float]:
        features = []
        for pair in self.target_pairs:
            ob = orderbooks.get(pair, {})
            depth = ob.get("depth", {})
            features += [
                float(ob.get("midPrice", 0)),
                float(ob.get("spread", 0)),
                float(depth.get("bid1pct", 0)),
                float(depth.get("ask1pct", 0)),
                float(prices.get(pair, 0)),
            ]
        return features

    def _decode(self, preds: "np.ndarray", prices: dict) -> list[TradePayload]:
        trades = []
        for i, pair in enumerate(self.target_pairs):
            action_probs = preds[i * 3:(i + 1) * 3]  # [HOLD, BUY, SELL]
            action = int(action_probs.argmax())
            confidence = float(action_probs[action])

            if action == 0 or confidence < self.confidence_threshold:
                continue

            price = float(prices.get(pair, 0))
            if price == 0:
                continue

            size = self._calc_size(pair, confidence)
            slippage = 1.005 if action == 1 else 0.995

            trades.append(TradePayload(
                action="BUY" if action == 1 else "SELL",
                pair=pair,
                amount=int(size),
                price_limit=int(price * slippage * 1e18),
                deadline=int(time.time()) + 120,
                nonce=self._nonce,
                vault=self.vault_address,
            ))
            self._nonce += 1

        return trades

    def _calc_size(self, pair: str, confidence: float) -> int:
        # Scale position size by confidence: 30%-100% of max
        fraction = 0.3 + 0.7 * (confidence - self.confidence_threshold) / (1 - self.confidence_threshold)
        return int(self.max_position_size * fraction)

    def _risk_filter(self, trades: list[TradePayload]) -> list[TradePayload]:
        approved = []
        for trade in trades:
            pos = self._positions.get(trade.pair, 0)
            delta = trade.amount if trade.action == "BUY" else -trade.amount
            if abs(pos + delta) > self.max_position_size:
                logger.warning("Skipping %s %s: would exceed position limit", trade.action, trade.pair)
                continue
            approved.append(trade)
        return approved

    def _sign(self, trade: TradePayload) -> SignedTrade:
        """Sign with enclave-born private key — Proof-of-Inference."""
        pair_hash = Web3.solidity_keccak(["string"], [trade.pair])

        payload_hash = Web3.solidity_keccak(
            ["uint8", "bytes32", "uint256", "uint256", "uint256", "uint256", "address"],
            [
                0 if trade.action == "BUY" else 1,
                pair_hash,
                trade.amount,
                trade.price_limit,
                trade.deadline,
                trade.nonce,
                trade.vault,
            ],
        )

        message = encode_defunct(payload_hash)
        signed = self.account.sign_message(message)

        return SignedTrade(
            payload=trade,
            payload_hash=payload_hash.hex(),
            signature=signed.signature.hex(),
            signer=self.public_key,
        )
