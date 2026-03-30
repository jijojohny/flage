"""
PyTorch Dataset for training the trading model from historical tick data
archived on 0G Storage Log Layer.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset

from .features import FeatureExtractor, normalize_features, FEATURES_PER_PAIR

logger = logging.getLogger(__name__)

# Label encoding
HOLD = 0
BUY = 1
SELL = 2

# Minimum return thresholds to label a step as BUY/SELL
BUY_THRESHOLD = 0.002    # +0.2% return to label as BUY
SELL_THRESHOLD = -0.002  # -0.2% return to label as SELL


class TradeDataset(Dataset):
    """
    Loads NDJSON tick data files from a directory and converts them
    into (features, labels) pairs for supervised training.

    Each sample:
      - features: float32 (num_pairs * FEATURES_PER_PAIR,)
      - label:    int64   (num_pairs,)  — per-pair HOLD/BUY/SELL

    Labels are derived from forward returns: if the price in
    `lookahead_steps` ticks is > BUY_THRESHOLD, label BUY; if <
    SELL_THRESHOLD, label SELL; else HOLD.
    """

    def __init__(
        self,
        data_dir: str | Path,
        pairs: list[str],
        lookahead_steps: int = 10,
        mean: np.ndarray | None = None,
        std: np.ndarray | None = None,
    ):
        self.pairs = pairs
        self.lookahead = lookahead_steps

        extractor = FeatureExtractor(pairs)
        raw_features: list[np.ndarray] = []
        raw_prices: list[dict[str, float]] = []

        # Load all NDJSON files
        data_path = Path(data_dir)
        files = sorted(data_path.glob("*.ndjson"))
        if not files:
            raise FileNotFoundError(f"No .ndjson files found in {data_dir}")

        for fpath in files:
            logger.info("Loading %s", fpath.name)
            with open(fpath) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    tick = json.loads(line)
                    pair = tick.get("pair", "")
                    if pair not in pairs:
                        continue

                    # Build a minimal orderbook from tick data
                    ob = {pair: {
                        "midPrice": tick.get("bid", 0),
                        "spread": str(
                            float(tick.get("ask", 0)) - float(tick.get("bid", 0))
                        ),
                        "depth": {},
                    }}
                    prices = {pair: float(tick.get("lastPrice", 0))}
                    feat = extractor.extract(ob, prices)
                    raw_features.append(feat)
                    raw_prices.append({p: float(prices.get(p, 0)) for p in pairs})

        if len(raw_features) < lookahead_steps + 1:
            raise ValueError(f"Not enough data: {len(raw_features)} samples")

        feature_matrix = np.stack(raw_features)
        self.features, self.mean, self.std = normalize_features(
            feature_matrix, mean, std
        )
        self._prices = raw_prices
        self._len = len(self.features) - lookahead_steps

    def __len__(self) -> int:
        return self._len

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        x = torch.from_numpy(self.features[idx]).float()
        labels = self._make_labels(idx)
        return x, labels

    def _make_labels(self, idx: int) -> torch.Tensor:
        labels = []
        current = self._prices[idx]
        future = self._prices[idx + self.lookahead]

        for pair in self.pairs:
            p0 = current.get(pair, 0)
            p1 = future.get(pair, 0)
            if p0 == 0:
                labels.append(HOLD)
                continue
            ret = (p1 - p0) / p0
            if ret > BUY_THRESHOLD:
                labels.append(BUY)
            elif ret < SELL_THRESHOLD:
                labels.append(SELL)
            else:
                labels.append(HOLD)

        return torch.tensor(labels, dtype=torch.long)
