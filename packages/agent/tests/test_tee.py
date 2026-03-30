"""Tests for TEE key generation."""
from __future__ import annotations

import os

import pytest
from eth_account import Account

from src.tee.key_gen import generate_enclave_keypair, EnclaveKeypair


def test_generates_keypair():
    kp = generate_enclave_keypair()
    assert isinstance(kp, EnclaveKeypair)


def test_private_key_length():
    kp = generate_enclave_keypair()
    assert len(kp.private_key) == 32


def test_public_key_is_eth_address():
    kp = generate_enclave_keypair()
    assert kp.public_key.startswith("0x")
    assert len(kp.public_key) == 42


def test_public_key_matches_private_key():
    kp = generate_enclave_keypair()
    account = Account.from_key(kp.private_key)
    assert account.address == kp.public_key


def test_two_keypairs_are_different():
    kp1 = generate_enclave_keypair()
    kp2 = generate_enclave_keypair()
    assert kp1.private_key != kp2.private_key
    assert kp1.public_key != kp2.public_key


def test_software_source_outside_tee(monkeypatch):
    monkeypatch.setenv("TEE_HARDWARE_AVAILABLE", "0")
    # Reimport to pick up env change
    import importlib
    import src.tee.key_gen as kg
    importlib.reload(kg)
    kp = kg.generate_enclave_keypair()
    assert kp.source == "software"
