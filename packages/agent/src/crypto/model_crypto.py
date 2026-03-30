"""
Model weight encryption/decryption for secure storage on 0G Storage.

Encryption scheme: AES-256-GCM
  - 32-byte random key
  - 12-byte random nonce (IV)
  - 16-byte authentication tag
  - Wire format: nonce (12) || tag (16) || ciphertext

The symmetric key is sealed (ECIES-encrypted) to the owner's public key
and stored alongside the model hash in the ERC-7857 iNFT.
"""
from __future__ import annotations

import os
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def generate_key() -> bytes:
    """Generate a random 256-bit AES key."""
    return os.urandom(32)


def encrypt_model(model_path: str | Path, key: bytes) -> bytes:
    """
    Encrypt a model file with AES-256-GCM.

    Returns the encrypted payload (nonce + tag + ciphertext) as bytes.
    The plaintext file is not modified.
    """
    if len(key) != 32:
        raise ValueError("Key must be 32 bytes (AES-256)")

    plaintext = Path(model_path).read_bytes()
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    # encrypt() returns ciphertext + tag appended
    ciphertext_with_tag = aesgcm.encrypt(nonce, plaintext, None)
    # Prepend nonce so we can decrypt without extra metadata
    return nonce + ciphertext_with_tag


def decrypt_model(encrypted: bytes, key: bytes) -> bytes:
    """
    Decrypt a model payload produced by encrypt_model().

    Returns raw plaintext bytes (the original model file content).
    Raises cryptography.exceptions.InvalidTag if key or data is wrong.
    """
    if len(key) != 32:
        raise ValueError("Key must be 32 bytes (AES-256)")
    if len(encrypted) < 12 + 16:
        raise ValueError("Encrypted payload too short")

    nonce = encrypted[:12]
    ciphertext_with_tag = encrypted[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext_with_tag, None)


def encrypt_model_to_file(
    model_path: str | Path,
    output_path: str | Path,
    key: bytes,
) -> bytes:
    """
    Encrypt model and write to output_path.
    Returns the raw encrypted bytes (same as written to file).
    """
    encrypted = encrypt_model(model_path, key)
    Path(output_path).write_bytes(encrypted)
    return encrypted


def decrypt_model_to_file(
    encrypted_path: str | Path,
    output_path: str | Path,
    key: bytes,
) -> None:
    """
    Decrypt an encrypted model file and write plaintext to output_path.
    Called inside the TEE after key broker releases the decryption key.
    """
    encrypted = Path(encrypted_path).read_bytes()
    plaintext = decrypt_model(encrypted, key)
    Path(output_path).write_bytes(plaintext)
