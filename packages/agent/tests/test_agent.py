"""Tests for FlageAgent — inference, signing, risk filtering."""
from __future__ import annotations

import json
import time
from unittest.mock import MagicMock, patch

import pytest
import torch
from eth_account import Account
from web3 import Web3

from src.agent import FlageAgent, TradePayload, SignedTrade
from src.models.trading_model import FlageTradingModel, ModelConfig, FEATURES_PER_PAIR

PAIRS = ["ETH/USDC", "BTC/USDC"]
NUM_PAIRS = len(PAIRS)
VAULT = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF"

PRICES = {"ETH/USDC": "3000.0", "BTC/USDC": "60000.0"}
ORDERBOOKS = {
    "ETH/USDC": {
        "midPrice": "3000.0",
        "spread": "1.0",
        "depth": {"bid1pct": "500.0", "ask1pct": "480.0"},
    },
    "BTC/USDC": {
        "midPrice": "60000.0",
        "spread": "10.0",
        "depth": {"bid1pct": "2000.0", "ask1pct": "1900.0"},
    },
}

PRIVATE_KEY = bytes.fromhex(
    "4c0883a69102937d6231471b5dbb6e538eba2ef2ab9bba28d2ecad18e0e2b5e0"
)


def _make_agent(high_confidence=False) -> FlageAgent:
    """Create a FlageAgent with a mocked model."""
    cfg = ModelConfig(num_pairs=NUM_PAIRS, hidden_dim=32, num_heads=2, num_layers=1, dropout=0)
    model = FlageTradingModel(cfg)
    model.eval()

    if high_confidence:
        # Override to always predict BUY with 100% confidence for pair 0
        def mock_forward(x):
            out = torch.zeros(x.size(0), NUM_PAIRS * 3)
            out[:, 1] = 10.0   # pair 0 BUY logit = very high
            out[:, 3] = 10.0   # pair 1 BUY logit = very high
            return out
        model.forward = mock_forward  # type: ignore

    config = {
        "vault_address": VAULT,
        "target_pairs": PAIRS,
        "max_position_size": int(1e18),
        "confidence_threshold": 0.7,
        "max_drawdown": 0.05,
    }

    with patch("src.agent.torch.jit.load", return_value=model):
        agent = FlageAgent(
            model_path="dummy.pt",
            config=config,
            private_key=PRIVATE_KEY,
        )
    return agent


class TestFlageAgentSigning:
    def test_signed_trade_has_correct_signer(self):
        agent = _make_agent(high_confidence=True)
        signed_trades = agent.process(ORDERBOOKS, PRICES)

        expected_address = Account.from_key(PRIVATE_KEY).address
        for st in signed_trades:
            assert st.signer == expected_address

    def test_signature_recovers_to_signer(self):
        agent = _make_agent(high_confidence=True)
        signed_trades = agent.process(ORDERBOOKS, PRICES)

        for st in signed_trades:
            pair_hash = Web3.solidity_keccak(["string"], [st.payload.pair])
            payload_hash = Web3.solidity_keccak(
                ["uint8", "bytes32", "uint256", "uint256", "uint256", "uint256", "address"],
                [
                    0 if st.payload.action == "BUY" else 1,
                    pair_hash,
                    st.payload.amount,
                    st.payload.price_limit,
                    st.payload.deadline,
                    st.payload.nonce,
                    st.payload.vault,
                ],
            )
            recovered = Account.recover_message(
                encode_defunct_msg(payload_hash),
                signature=bytes.fromhex(st.signature.lstrip("0x")),
            )
            assert recovered.lower() == st.signer.lower()

    def test_nonces_monotonically_increase(self):
        agent = _make_agent(high_confidence=True)
        all_trades = []
        for _ in range(5):
            all_trades += agent.process(ORDERBOOKS, PRICES)
        nonces = [t.payload.nonce for t in all_trades]
        assert nonces == list(range(len(nonces)))

    def test_deadline_is_in_future(self):
        agent = _make_agent(high_confidence=True)
        trades = agent.process(ORDERBOOKS, PRICES)
        now = int(time.time())
        for st in trades:
            assert st.payload.deadline > now

    def test_vault_address_in_payload(self):
        agent = _make_agent(high_confidence=True)
        trades = agent.process(ORDERBOOKS, PRICES)
        for st in trades:
            assert st.payload.vault == VAULT


class TestRiskFilter:
    def test_empty_prices_returns_empty(self):
        agent = _make_agent()
        assert agent.process({}, {}) == []

    def test_position_limit_respected(self):
        agent = _make_agent(high_confidence=True)
        # Max out the position
        agent._positions["ETH/USDC"] = agent.max_position_size

        trades = agent.process(ORDERBOOKS, PRICES)
        eth_buys = [t for t in trades if t.payload.pair == "ETH/USDC" and t.payload.action == "BUY"]
        assert len(eth_buys) == 0, "Should not BUY when position is maxed out"

    def test_below_confidence_threshold_no_trade(self):
        agent = _make_agent(high_confidence=False)  # random model, low confidence likely
        # Set threshold to 1.0 so nothing passes
        agent.confidence_threshold = 1.0
        trades = agent.process(ORDERBOOKS, PRICES)
        assert trades == []


class TestFeatureExtraction:
    def test_feature_vector_length(self):
        agent = _make_agent()
        features = agent._extract_features(ORDERBOOKS, PRICES)
        assert len(features) == NUM_PAIRS * FEATURES_PER_PAIR

    def test_missing_pair_fills_zero(self):
        agent = _make_agent()
        features = agent._extract_features({}, {})
        assert all(f == 0.0 for f in features)


# Helper — avoids importing from eth_account inside the test body
from eth_account.messages import encode_defunct as _encode_defunct

def encode_defunct_msg(hash_bytes: bytes):
    return _encode_defunct(hash_bytes)
