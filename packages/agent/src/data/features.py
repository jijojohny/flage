"""
Feature engineering — converts raw order book + price data
into normalized float32 tensors for the trading model.
"""
from __future__ import annotations

import numpy as np


FEATURES_PER_PAIR = 5  # must match models/trading_model.py


class FeatureExtractor:
    """
    Converts raw market data dicts (as served by the KV Layer)
    into a flat numpy array the model can consume.
    """

    def __init__(self, pairs: list[str]):
        self.pairs = pairs
        self._price_history: dict[str, list[float]] = {p: [] for p in pairs}
        self._history_len = 20  # rolling window for z-score normalization

    def extract(self, orderbooks: dict, prices: dict) -> np.ndarray:
        """
        Returns float32 array of shape (num_pairs * FEATURES_PER_PAIR,).
        Missing pairs are filled with zeros.
        """
        features: list[float] = []

        for pair in self.pairs:
            ob = orderbooks.get(pair, {})
            depth = ob.get("depth", {})

            mid = float(ob.get("midPrice") or prices.get(pair) or 0)
            spread = float(ob.get("spread") or 0)
            bid_depth = float(depth.get("bid1pct") or 0)
            ask_depth = float(depth.get("ask1pct") or 0)
            price = float(prices.get(pair) or 0)

            # Update rolling price history for z-score
            if price > 0:
                self._price_history[pair].append(price)
                if len(self._price_history[pair]) > self._history_len:
                    self._price_history[pair].pop(0)

            features += [mid, spread, bid_depth, ask_depth, price]

        return np.array(features, dtype=np.float32)

    def reset(self) -> None:
        self._price_history = {p: [] for p in self.pairs}


def normalize_features(
    features: np.ndarray,
    mean: np.ndarray | None = None,
    std: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Z-score normalize a 2D feature matrix (samples, features).
    Returns (normalized, mean, std).
    If mean/std are provided they are used directly (inference mode).
    """
    if mean is None:
        mean = features.mean(axis=0)
    if std is None:
        std = features.std(axis=0)
        std = np.where(std == 0, 1.0, std)     # avoid divide-by-zero
    return (features - mean) / std, mean, std
