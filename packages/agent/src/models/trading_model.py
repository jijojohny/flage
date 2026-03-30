"""
Flage Trading Model — Transformer-based multi-pair arbitrage detector.

Input:  (batch, num_pairs * FEATURES_PER_PAIR) float32 tensor
Output: (batch, num_pairs * 3) float32 tensor — per-pair [HOLD, BUY, SELL] softmax probs

Designed to run efficiently on NVIDIA H100 inside TEE.
"""
from __future__ import annotations

from dataclasses import dataclass

import torch
import torch.nn as nn


FEATURES_PER_PAIR = 5  # mid_price, spread, bid_depth_1pct, ask_depth_1pct, price


@dataclass
class ModelConfig:
    num_pairs: int = 10
    hidden_dim: int = 256
    num_heads: int = 8
    num_layers: int = 4
    dropout: float = 0.1
    num_actions: int = 3        # HOLD, BUY, SELL


class FlageTradingModel(nn.Module):
    """
    Multi-head self-attention model for detecting cross-venue arbitrage.

    Architecture:
      1. Linear encoder: raw features → hidden_dim
      2. Transformer: cross-pair attention (each pair = one token)
      3. Per-pair action heads: hidden_dim → [HOLD, BUY, SELL]
    """

    def __init__(self, cfg: ModelConfig):
        super().__init__()
        self.cfg = cfg
        input_dim = cfg.num_pairs * FEATURES_PER_PAIR

        # Per-feature normalization
        self.input_norm = nn.LayerNorm(input_dim)

        # Project flat features into per-pair tokens
        self.pair_embed = nn.Linear(FEATURES_PER_PAIR, cfg.hidden_dim)

        # Learnable positional embedding (one per pair)
        self.pos_embed = nn.Embedding(cfg.num_pairs, cfg.hidden_dim)

        # Transformer encoder
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=cfg.hidden_dim,
            nhead=cfg.num_heads,
            dim_feedforward=cfg.hidden_dim * 4,
            dropout=cfg.dropout,
            batch_first=True,
            norm_first=True,       # pre-norm for training stability
        )
        self.transformer = nn.TransformerEncoder(
            encoder_layer,
            num_layers=cfg.num_layers,
            enable_nested_tensor=False,
        )

        # Per-pair action heads
        self.action_heads = nn.ModuleList([
            nn.Sequential(
                nn.Linear(cfg.hidden_dim, cfg.hidden_dim // 2),
                nn.GELU(),
                nn.Dropout(cfg.dropout),
                nn.Linear(cfg.hidden_dim // 2, cfg.num_actions),
            )
            for _ in range(cfg.num_pairs)
        ])

        self._init_weights()

    def _init_weights(self) -> None:
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
            elif isinstance(m, nn.Embedding):
                nn.init.normal_(m.weight, std=0.02)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch, num_pairs * FEATURES_PER_PAIR)
        Returns:
            (batch, num_pairs * num_actions) — raw logits before softmax
        """
        B = x.size(0)
        N = self.cfg.num_pairs

        # Normalize input
        x = self.input_norm(x)

        # Reshape to per-pair tokens: (batch, num_pairs, FEATURES_PER_PAIR)
        x = x.view(B, N, FEATURES_PER_PAIR)

        # Embed each pair's features
        tokens = self.pair_embed(x)  # (B, N, hidden_dim)

        # Add positional embeddings
        positions = torch.arange(N, device=x.device)
        tokens = tokens + self.pos_embed(positions).unsqueeze(0)  # (B, N, hidden_dim)

        # Transformer
        attended = self.transformer(tokens)  # (B, N, hidden_dim)

        # Per-pair action logits
        action_logits = torch.stack(
            [self.action_heads[i](attended[:, i, :]) for i in range(N)],
            dim=1,
        )  # (B, N, num_actions)

        return action_logits.view(B, N * self.cfg.num_actions)

    def predict_probs(self, x: torch.Tensor) -> torch.Tensor:
        """Returns softmax probabilities. (B, N * num_actions)"""
        logits = self.forward(x)
        B, total = logits.shape
        N = self.cfg.num_pairs
        logits_3d = logits.view(B, N, self.cfg.num_actions)
        probs_3d = torch.softmax(logits_3d, dim=-1)
        return probs_3d.view(B, total)

    @classmethod
    def from_config(cls, **kwargs) -> "FlageTradingModel":
        return cls(ModelConfig(**kwargs))
