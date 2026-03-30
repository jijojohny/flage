"""Tests for the TradeDataset."""
from __future__ import annotations

import torch
import pytest

from src.data.dataset import TradeDataset, HOLD, BUY, SELL

PAIRS = ["ETH/USDC", "BTC/USDC"]
LOOKAHEAD = 5


def test_dataset_loads(ndjson_data_dir):
    ds = TradeDataset(ndjson_data_dir, PAIRS, lookahead_steps=LOOKAHEAD)
    assert len(ds) > 0


def test_sample_shapes(ndjson_data_dir):
    ds = TradeDataset(ndjson_data_dir, PAIRS, lookahead_steps=LOOKAHEAD)
    features, labels = ds[0]
    assert features.shape == (len(PAIRS) * 5,)
    assert labels.shape == (len(PAIRS),)
    assert features.dtype == torch.float32
    assert labels.dtype == torch.int64


def test_labels_in_valid_range(ndjson_data_dir):
    ds = TradeDataset(ndjson_data_dir, PAIRS, lookahead_steps=LOOKAHEAD)
    for i in range(min(50, len(ds))):
        _, labels = ds[i]
        assert labels.min() >= 0
        assert labels.max() <= 2


def test_length_reduced_by_lookahead(ndjson_data_dir):
    ds5 = TradeDataset(ndjson_data_dir, PAIRS, lookahead_steps=5)
    ds10 = TradeDataset(ndjson_data_dir, PAIRS, lookahead_steps=10)
    assert len(ds5) > len(ds10)


def test_normalization_stats_stored(ndjson_data_dir):
    ds = TradeDataset(ndjson_data_dir, PAIRS, lookahead_steps=LOOKAHEAD)
    assert ds.mean is not None
    assert ds.std is not None
    assert ds.mean.shape == (len(PAIRS) * 5,)


def test_missing_data_dir_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        TradeDataset(tmp_path / "nonexistent", PAIRS)
