"""
Training pipeline for the Flage trading model.

Usage:
  python train.py \
    --data-dir ./data/raw \
    --pairs ETH/USDC,BTC/USDC \
    --output ./models/flage_v1.pt \
    --epochs 50 \
    --batch-size 256

After training, the script exports a TorchScript model that can be
loaded inside the TEE with torch.jit.load().
"""
from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split

from src.models.trading_model import FlageTradingModel, ModelConfig
from src.data.dataset import TradeDataset, HOLD, BUY, SELL

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("train")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train the Flage trading model")
    p.add_argument("--data-dir", required=True, help="Directory of .ndjson tick files")
    p.add_argument("--pairs", required=True, help="Comma-separated pair list, e.g. ETH/USDC,BTC/USDC")
    p.add_argument("--output", default="models/flage_v1.pt", help="Output TorchScript model path")
    p.add_argument("--epochs", type=int, default=50)
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--val-split", type=float, default=0.15)
    p.add_argument("--lookahead", type=int, default=10, help="Steps ahead for return labeling")
    p.add_argument("--hidden-dim", type=int, default=256)
    p.add_argument("--num-layers", type=int, default=4)
    p.add_argument("--num-heads", type=int, default=8)
    p.add_argument("--dropout", type=float, default=0.1)
    p.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    p.add_argument("--stats-out", default=None, help="Path to save normalization stats JSON")
    return p.parse_args()


def compute_class_weights(dataset: TradeDataset, num_pairs: int) -> torch.Tensor:
    """Compute per-class weights to handle HOLD class imbalance."""
    counts = np.zeros(3, dtype=np.float64)
    for _, labels in dataset:
        for label in labels.numpy():
            counts[int(label)] += 1
    total = counts.sum()
    # Inverse frequency weighting
    weights = total / (3 * counts + 1e-8)
    return torch.tensor(weights, dtype=torch.float32)


def train_epoch(
    model: nn.Module,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    criterion: nn.Module,
    device: torch.device,
    num_pairs: int,
) -> float:
    model.train()
    total_loss = 0.0

    for features, labels in loader:
        features = features.to(device)
        labels = labels.to(device)          # (batch, num_pairs)

        optimizer.zero_grad()
        logits = model(features)            # (batch, num_pairs * 3)
        logits_3d = logits.view(-1, num_pairs, 3)

        # Cross-entropy over all pairs and batch
        loss = criterion(
            logits_3d.reshape(-1, 3),
            labels.reshape(-1),
        )
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        total_loss += loss.item()

    return total_loss / len(loader)


@torch.no_grad()
def evaluate(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    num_pairs: int,
) -> dict:
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0
    correct_non_hold = 0
    total_non_hold = 0

    for features, labels in loader:
        features = features.to(device)
        labels = labels.to(device)

        logits = model(features)
        logits_3d = logits.view(-1, num_pairs, 3)
        preds = logits_3d.argmax(dim=-1)    # (batch, num_pairs)

        loss = criterion(
            logits_3d.reshape(-1, 3),
            labels.reshape(-1),
        )
        total_loss += loss.item()

        correct += (preds == labels).sum().item()
        total += labels.numel()

        non_hold_mask = labels != HOLD
        correct_non_hold += (preds[non_hold_mask] == labels[non_hold_mask]).sum().item()
        total_non_hold += non_hold_mask.sum().item()

    return {
        "loss": total_loss / len(loader),
        "accuracy": correct / total if total else 0,
        "signal_accuracy": correct_non_hold / total_non_hold if total_non_hold else 0,
    }


def main() -> None:
    args = parse_args()
    device = torch.device(args.device)
    pairs = [p.strip() for p in args.pairs.split(",")]
    num_pairs = len(pairs)

    logger.info("Device: %s | Pairs: %s", device, pairs)

    # Load dataset
    logger.info("Loading dataset from %s", args.data_dir)
    dataset = TradeDataset(
        data_dir=args.data_dir,
        pairs=pairs,
        lookahead_steps=args.lookahead,
    )
    logger.info("Dataset size: %d samples", len(dataset))

    # Train / val split
    val_size = int(len(dataset) * args.val_split)
    train_size = len(dataset) - val_size
    train_ds, val_ds = random_split(dataset, [train_size, val_size])

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=4, pin_memory=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size * 2, shuffle=False, num_workers=2)

    # Class weights to counteract HOLD dominance
    class_weights = compute_class_weights(train_ds.dataset, num_pairs).to(device)  # type: ignore

    # Build model
    cfg = ModelConfig(
        num_pairs=num_pairs,
        hidden_dim=args.hidden_dim,
        num_heads=args.num_heads,
        num_layers=args.num_layers,
        dropout=args.dropout,
    )
    model = FlageTradingModel(cfg).to(device)
    total_params = sum(p.numel() for p in model.parameters())
    logger.info("Model params: %s", f"{total_params:,}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    criterion = nn.CrossEntropyLoss(weight=class_weights)

    best_val_loss = float("inf")
    best_state: dict | None = None

    for epoch in range(1, args.epochs + 1):
        train_loss = train_epoch(model, train_loader, optimizer, criterion, device, num_pairs)
        val_metrics = evaluate(model, val_loader, criterion, device, num_pairs)
        scheduler.step()

        logger.info(
            "Epoch %3d/%d | train_loss=%.4f | val_loss=%.4f | acc=%.3f | signal_acc=%.3f",
            epoch, args.epochs,
            train_loss, val_metrics["loss"],
            val_metrics["accuracy"], val_metrics["signal_accuracy"],
        )

        if val_metrics["loss"] < best_val_loss:
            best_val_loss = val_metrics["loss"]
            best_state = {k: v.clone() for k, v in model.state_dict().items()}

    # Restore best weights
    if best_state:
        model.load_state_dict(best_state)

    # Export TorchScript
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    model.eval()
    example = torch.zeros(1, num_pairs * 5).to(device)
    scripted = torch.jit.trace(model, example)
    scripted.save(str(output_path))
    logger.info("Model saved to %s", output_path)

    # Save normalization stats
    if args.stats_out:
        stats = {
            "mean": dataset.mean.tolist(),
            "std": dataset.std.tolist(),
            "pairs": pairs,
        }
        Path(args.stats_out).write_text(json.dumps(stats, indent=2))
        logger.info("Normalization stats saved to %s", args.stats_out)

    logger.info("Training complete. Best val_loss=%.4f", best_val_loss)


if __name__ == "__main__":
    main()
