"""Tests for FlageTradingModel."""
from __future__ import annotations

import torch
import pytest

from src.models.trading_model import FlageTradingModel, ModelConfig, FEATURES_PER_PAIR

NUM_PAIRS = 2


def test_forward_shape(model, dummy_features):
    out = model(dummy_features)
    assert out.shape == (4, NUM_PAIRS * 3), f"Expected (4, {NUM_PAIRS * 3}), got {out.shape}"


def test_forward_no_nan(model, dummy_features):
    out = model(dummy_features)
    assert not torch.isnan(out).any(), "Output contains NaN"
    assert not torch.isinf(out).any(), "Output contains Inf"


def test_predict_probs_sums_to_one(model, dummy_features):
    probs = model.predict_probs(dummy_features)
    B, total = probs.shape
    N = NUM_PAIRS
    probs_3d = probs.view(B, N, 3)
    sums = probs_3d.sum(dim=-1)
    assert torch.allclose(sums, torch.ones_like(sums), atol=1e-5), \
        "Softmax probs don't sum to 1"


def test_different_inputs_different_outputs(model):
    x1 = torch.randn(1, NUM_PAIRS * FEATURES_PER_PAIR)
    x2 = torch.randn(1, NUM_PAIRS * FEATURES_PER_PAIR)
    out1 = model(x1)
    out2 = model(x2)
    assert not torch.allclose(out1, out2), "Different inputs produced identical outputs"


def test_batch_consistency(model):
    """Single sample processed individually vs in a batch should give same result."""
    x = torch.randn(3, NUM_PAIRS * FEATURES_PER_PAIR)
    batch_out = model(x)
    for i in range(3):
        single_out = model(x[i:i+1])
        assert torch.allclose(batch_out[i:i+1], single_out, atol=1e-5), \
            f"Batch and single sample differ at index {i}"


def test_torchscript_export(model, tmp_path):
    example = torch.zeros(1, NUM_PAIRS * FEATURES_PER_PAIR)
    scripted = torch.jit.trace(model, example)
    out_path = tmp_path / "model.pt"
    scripted.save(str(out_path))
    loaded = torch.jit.load(str(out_path))
    loaded.eval()

    x = torch.randn(2, NUM_PAIRS * FEATURES_PER_PAIR)
    assert torch.allclose(model(x), loaded(x), atol=1e-5)


def test_from_config():
    m = FlageTradingModel.from_config(num_pairs=3, hidden_dim=32, num_heads=4, num_layers=1)
    x = torch.randn(1, 3 * FEATURES_PER_PAIR)
    out = m(x)
    assert out.shape == (1, 9)
