"""Tests for feature extraction and normalization."""
from __future__ import annotations

import numpy as np
import pytest

from src.data.features import FeatureExtractor, normalize_features, FEATURES_PER_PAIR

PAIRS = ["ETH/USDC", "BTC/USDC"]


@pytest.fixture
def extractor():
    return FeatureExtractor(PAIRS)


def _make_market(eth_price=3000.0, btc_price=60000.0):
    orderbooks = {
        "ETH/USDC": {
            "midPrice": str(eth_price),
            "spread": "1.0",
            "depth": {"bid1pct": "500.0", "ask1pct": "480.0"},
        },
        "BTC/USDC": {
            "midPrice": str(btc_price),
            "spread": "10.0",
            "depth": {"bid1pct": "2000.0", "ask1pct": "1900.0"},
        },
    }
    prices = {"ETH/USDC": str(eth_price), "BTC/USDC": str(btc_price)}
    return orderbooks, prices


def test_output_shape(extractor):
    ob, prices = _make_market()
    feat = extractor.extract(ob, prices)
    assert feat.shape == (len(PAIRS) * FEATURES_PER_PAIR,)
    assert feat.dtype == np.float32


def test_missing_pair_fills_zeros(extractor):
    feat = extractor.extract({}, {})
    assert (feat == 0).all()


def test_partial_data(extractor):
    ob = {"ETH/USDC": {"midPrice": "3000", "spread": "1", "depth": {}}}
    prices = {"ETH/USDC": "3000"}
    feat = extractor.extract(ob, prices)
    # ETH features should be non-zero, BTC should be zero
    eth_feats = feat[:FEATURES_PER_PAIR]
    btc_feats = feat[FEATURES_PER_PAIR:]
    assert eth_feats[0] == pytest.approx(3000.0)
    assert (btc_feats == 0).all()


def test_values_match_input(extractor):
    ob, prices = _make_market(eth_price=3250.5, btc_price=61000.0)
    feat = extractor.extract(ob, prices)
    assert feat[0] == pytest.approx(3250.5)   # ETH mid
    assert feat[4] == pytest.approx(3250.5)   # ETH price
    assert feat[5] == pytest.approx(61000.0)  # BTC mid
    assert feat[9] == pytest.approx(61000.0)  # BTC price


def test_normalize_features_zero_mean():
    data = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]], dtype=np.float32)
    normed, mean, std = normalize_features(data)
    assert normed.mean(axis=0) == pytest.approx([0.0, 0.0], abs=1e-5)


def test_normalize_features_unit_std():
    data = np.random.randn(100, 10).astype(np.float32)
    normed, mean, std = normalize_features(data)
    assert normed.std(axis=0) == pytest.approx(np.ones(10), abs=0.15)


def test_normalize_uses_provided_stats():
    data = np.array([[10.0, 20.0]], dtype=np.float32)
    mean = np.array([5.0, 10.0])
    std = np.array([5.0, 10.0])
    normed, _, _ = normalize_features(data, mean=mean, std=std)
    assert normed[0] == pytest.approx([1.0, 1.0])


def test_constant_column_no_divide_by_zero():
    data = np.ones((10, 3), dtype=np.float32)
    normed, mean, std = normalize_features(data)
    assert not np.isnan(normed).any()
    assert not np.isinf(normed).any()
