"""Shared pytest fixtures for the flage agent test suite."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import numpy as np
import pytest
import torch

from src.models.trading_model import FlageTradingModel, ModelConfig

PAIRS = ["ETH/USDC", "BTC/USDC"]
NUM_PAIRS = len(PAIRS)


@pytest.fixture
def model_cfg() -> ModelConfig:
    return ModelConfig(
        num_pairs=NUM_PAIRS,
        hidden_dim=64,
        num_heads=4,
        num_layers=2,
        dropout=0.0,
    )


@pytest.fixture
def model(model_cfg: ModelConfig) -> FlageTradingModel:
    m = FlageTradingModel(model_cfg)
    m.eval()
    return m


@pytest.fixture
def dummy_features() -> torch.Tensor:
    """Batch of 4 random feature vectors."""
    return torch.randn(4, NUM_PAIRS * 5)


@pytest.fixture
def ndjson_data_dir() -> Path:
    """
    Temporary directory with synthetic NDJSON tick data
    for testing the dataset and training pipeline.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir)
        ticks = []
        price = {"ETH/USDC": 3000.0, "BTC/USDC": 60000.0}

        for i in range(300):
            for pair, base_price in price.items():
                # Random walk
                p = base_price * (1 + np.random.normal(0, 0.001))
                price[pair] = p
                ticks.append({
                    "source": "test",
                    "pair": pair,
                    "timestamp": str(i * 1_000_000_000),
                    "bid": str(round(p - 0.5, 4)),
                    "ask": str(round(p + 0.5, 4)),
                    "bidSize": "1.0",
                    "askSize": "1.0",
                    "lastPrice": str(round(p, 4)),
                    "volume24h": "1000000",
                })

        with open(path / "ticks_0.ndjson", "w") as f:
            for tick in ticks:
                f.write(json.dumps(tick) + "\n")

        yield path
