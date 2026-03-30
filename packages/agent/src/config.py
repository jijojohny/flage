"""
Configuration management for the flage agent.
All settings are validated at startup so missing env vars fail fast.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class AgentConfig:
    # Vault
    vault_address: str

    # Trading
    target_pairs: list[str]
    max_position_size: int          # in wei
    confidence_threshold: float     # 0–1, minimum to act
    max_drawdown: float             # fraction, e.g. 0.05 = 5%
    deadline_offset_seconds: int    # how far in future to set trade deadlines
    poll_interval_seconds: float    # KV read frequency

    # Model
    model_path: str
    device: str                     # "cuda" | "cpu"

    # Network
    og_rpc_url: str
    og_kv_node_url: str
    og_stream_id: str

    # Keys (optional — TEE generates its own at boot)
    tee_signing_key: bytes | None   # if None, generated in enclave
    settlement_private_key: str


def load_config() -> AgentConfig:
    """Load and validate config from environment variables."""

    def _require(key: str) -> str:
        val = os.environ.get(key)
        if not val:
            raise EnvironmentError(f"Required environment variable not set: {key}")
        return val

    def _optional(key: str, default: str) -> str:
        return os.environ.get(key, default)

    raw_key = os.environ.get("TEE_SIGNING_KEY")
    tee_key = bytes.fromhex(raw_key.lstrip("0x")) if raw_key else None

    pairs_raw = _require("TARGET_PAIRS")
    target_pairs = [p.strip() for p in pairs_raw.split(",") if p.strip()]
    if not target_pairs:
        raise ValueError("TARGET_PAIRS must contain at least one pair")

    confidence = float(_optional("CONFIDENCE_THRESHOLD", "0.70"))
    if not 0.0 < confidence < 1.0:
        raise ValueError("CONFIDENCE_THRESHOLD must be between 0 and 1")

    max_drawdown = float(_optional("MAX_DRAWDOWN", "0.05"))
    if not 0.0 < max_drawdown < 1.0:
        raise ValueError("MAX_DRAWDOWN must be between 0 and 1")

    return AgentConfig(
        vault_address=_require("VAULT_ADDRESS"),
        target_pairs=target_pairs,
        max_position_size=int(_optional("MAX_POSITION_SIZE", str(10 * 10**18))),
        confidence_threshold=confidence,
        max_drawdown=max_drawdown,
        deadline_offset_seconds=int(_optional("DEADLINE_OFFSET_SECONDS", "120")),
        poll_interval_seconds=float(_optional("POLL_INTERVAL_SECONDS", "0.5")),
        model_path=_require("MODEL_PATH"),
        device=_optional("DEVICE", "cuda"),
        og_rpc_url=_require("OG_RPC_URL"),
        og_kv_node_url=_require("OG_KV_NODE_URL"),
        og_stream_id=_optional("OG_STREAM_ID", ""),
        tee_signing_key=tee_key,
        settlement_private_key=_require("SETTLEMENT_PRIVATE_KEY"),
    )
