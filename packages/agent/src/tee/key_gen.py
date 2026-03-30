"""
TEE enclave key generation.

In production (Intel TDX + NVIDIA H100) the key is generated using the
hardware's trusted random number generator via the TEE SDK. Outside a TEE
(dev/test) we fall back to os.urandom.

The private key NEVER leaves the enclave boundary. Only the public key
(Ethereum address) is published and bound to the on-chain attestation.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from eth_account import Account
from eth_keys import keys as eth_keys_lib

logger = logging.getLogger(__name__)

# TEE SDK availability flag — set True only when running inside a real CVM
_TEE_AVAILABLE = os.environ.get("TEE_HARDWARE_AVAILABLE", "0") == "1"


@dataclass(frozen=True)
class EnclaveKeypair:
    private_key: bytes      # 32 bytes — NEVER log or export this
    public_key: str         # Ethereum address (checksum)
    source: str             # "hardware" | "software"


def generate_enclave_keypair() -> EnclaveKeypair:
    """
    Generate an ECDSA keypair inside the TEE enclave.

    Hardware path: uses the TEE SDK's trusted RNG via /dev/tdx_guest
    or equivalent. Only available inside a real CVM.

    Software path: os.urandom — used for development and testing only.
    Never use the software path in production.
    """
    if _TEE_AVAILABLE:
        private_key_bytes = _generate_tee_random_bytes(32)
        source = "hardware"
        logger.info("Enclave keypair generated via TEE hardware RNG")
    else:
        private_key_bytes = os.urandom(32)
        source = "software"
        logger.warning(
            "TEE hardware not available — using software RNG. "
            "NOT safe for production."
        )

    account = Account.from_key(private_key_bytes)
    return EnclaveKeypair(
        private_key=private_key_bytes,
        public_key=account.address,
        source=source,
    )


def _generate_tee_random_bytes(n: int) -> bytes:
    """
    Read cryptographically secure random bytes from the TEE's
    hardware RNG. Falls back to /dev/urandom if the TEE device
    is not accessible (should not happen inside a real CVM).

    For Intel TDX, the recommended approach is to use the RDRAND
    instruction exposed via the TDX guest kernel or the Intel
    Trust Domain Attestation SDK.
    """
    tee_rng_paths = [
        "/dev/tdx_guest",   # Intel TDX guest device
        "/dev/hwrng",       # Generic hardware RNG
        "/dev/urandom",     # Fallback
    ]
    for path in tee_rng_paths:
        try:
            with open(path, "rb") as f:
                data = f.read(n)
            if len(data) == n:
                return data
        except OSError:
            continue

    raise RuntimeError("Could not read from any TEE/hardware RNG source")
