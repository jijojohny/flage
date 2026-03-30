"""Tests for model encryption/decryption."""
from __future__ import annotations

import os
import pytest

from src.crypto.model_crypto import (
    generate_key,
    encrypt_model,
    decrypt_model,
    encrypt_model_to_file,
    decrypt_model_to_file,
)


@pytest.fixture
def key():
    return generate_key()


@pytest.fixture
def model_file(tmp_path):
    path = tmp_path / "model.pt"
    path.write_bytes(os.urandom(1024))  # fake model bytes
    return path


def test_generate_key_length():
    k = generate_key()
    assert len(k) == 32


def test_generate_key_random():
    assert generate_key() != generate_key()


def test_encrypt_decrypt_roundtrip(key, model_file):
    plaintext = model_file.read_bytes()
    encrypted = encrypt_model(model_file, key)
    recovered = decrypt_model(encrypted, key)
    assert recovered == plaintext


def test_encrypted_differs_from_plaintext(key, model_file):
    plaintext = model_file.read_bytes()
    encrypted = encrypt_model(model_file, key)
    assert encrypted != plaintext


def test_nonce_prepended(key, model_file):
    encrypted = encrypt_model(model_file, key)
    # nonce=12, tag=16, so min length is 28 + 1 byte plaintext
    assert len(encrypted) >= 28


def test_wrong_key_raises(key, model_file):
    encrypted = encrypt_model(model_file, key)
    wrong_key = generate_key()
    from cryptography.exceptions import InvalidTag
    with pytest.raises(InvalidTag):
        decrypt_model(encrypted, wrong_key)


def test_tampered_ciphertext_raises(key, model_file):
    encrypted = bytearray(encrypt_model(model_file, key))
    encrypted[-1] ^= 0xFF  # flip last byte
    from cryptography.exceptions import InvalidTag
    with pytest.raises(InvalidTag):
        decrypt_model(bytes(encrypted), key)


def test_encrypt_to_file(key, model_file, tmp_path):
    out = tmp_path / "model.enc"
    encrypted = encrypt_model_to_file(model_file, out, key)
    assert out.exists()
    assert out.read_bytes() == encrypted


def test_decrypt_to_file(key, model_file, tmp_path):
    enc_path = tmp_path / "model.enc"
    out_path = tmp_path / "model_recovered.pt"
    encrypt_model_to_file(model_file, enc_path, key)
    decrypt_model_to_file(enc_path, out_path, key)
    assert out_path.read_bytes() == model_file.read_bytes()


def test_short_key_raises(model_file):
    with pytest.raises(ValueError, match="32 bytes"):
        encrypt_model(model_file, b"tooshort")


def test_payload_too_short_raises(key):
    with pytest.raises(ValueError, match="too short"):
        decrypt_model(b"\x00" * 10, key)
