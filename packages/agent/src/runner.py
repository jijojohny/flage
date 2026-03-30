"""
Inference runner — polls 0G Storage KV Layer and submits signed trades.
Runs indefinitely inside the TEE enclave.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os

import aiohttp
from web3 import AsyncWeb3, Web3
from web3.middleware import geth_poa_middleware

from agent import FlageAgent, SignedTrade

logger = logging.getLogger(__name__)


class KVLayerClient:
    """Reads real-time market data from 0G Storage KV Layer."""

    def __init__(self, kv_node_url: str, stream_id: str):
        self.base_url = kv_node_url.rstrip("/")
        self.stream_id = stream_id
        self._session: aiohttp.ClientSession | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def get(self, key: str) -> bytes | None:
        session = await self._get_session()
        url = f"{self.base_url}/kv/value?stream_id={self.stream_id}&key={key}"
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=2)) as resp:
                if resp.status == 200:
                    return await resp.read()
                return None
        except Exception as e:
            logger.warning("KV read failed for %s: %s", key, e)
            return None

    async def close(self):
        if self._session:
            await self._session.close()


class SettlementClient:
    """Submits signed trade payloads to FlageVault on 0G Chain."""

    VAULT_ABI = [
        {
            "name": "executeTrade",
            "type": "function",
            "inputs": [
                {
                    "name": "payload",
                    "type": "tuple",
                    "components": [
                        {"name": "action", "type": "uint8"},
                        {"name": "pair", "type": "bytes32"},
                        {"name": "amount", "type": "uint256"},
                        {"name": "priceLimit", "type": "uint256"},
                        {"name": "deadline", "type": "uint256"},
                        {"name": "nonce", "type": "uint256"},
                        {"name": "vault", "type": "address"},
                    ],
                },
                {"name": "signature", "type": "bytes"},
            ],
            "outputs": [],
        }
    ]

    def __init__(self, rpc_url: str, vault_address: str, private_key: str):
        self.w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(rpc_url))
        self.account = self.w3.eth.account.from_key(private_key)
        self.vault = self.w3.eth.contract(
            address=Web3.to_checksum_address(vault_address),
            abi=self.VAULT_ABI,
        )

    async def submit_trade(self, signed_trade: SignedTrade) -> str:
        p = signed_trade.payload
        pair_hash = Web3.solidity_keccak(["string"], [p.pair])

        tx = await self.vault.functions.executeTrade(
            (
                0 if p.action == "BUY" else 1,
                pair_hash,
                p.amount,
                p.price_limit,
                p.deadline,
                p.nonce,
                p.vault,
            ),
            bytes.fromhex(signed_trade.signature.lstrip("0x")),
        ).build_transaction({
            "from": self.account.address,
            "nonce": await self.w3.eth.get_transaction_count(self.account.address),
            "gas": 300_000,
        })

        signed_tx = self.account.sign_transaction(tx)
        tx_hash = await self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        receipt = await self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)

        if receipt["status"] != 1:
            raise RuntimeError(f"Trade tx reverted: {tx_hash.hex()}")

        return tx_hash.hex()


class InferenceRunner:
    """Main loop — runs indefinitely inside the TEE."""

    def __init__(
        self,
        agent: FlageAgent,
        kv_client: KVLayerClient,
        settlement: SettlementClient,
        poll_interval: float = 0.5,
    ):
        self.agent = agent
        self.kv = kv_client
        self.settlement = settlement
        self.poll_interval = poll_interval

    async def run(self):
        logger.info("flage agent started")
        logger.info("TEE public key: %s", self.agent.public_key)
        logger.info("Target pairs: %s", self.agent.target_pairs)

        while True:
            try:
                await self._tick()
            except Exception as e:
                logger.error("Tick error: %s", e, exc_info=True)
            await asyncio.sleep(self.poll_interval)

    async def _tick(self):
        # 1. Read market data from KV Layer
        orderbooks: dict = {}
        prices: dict = {}

        for pair in self.agent.target_pairs:
            ob_raw = await self.kv.get(f"orderbook:{pair}")
            if ob_raw:
                orderbooks[pair] = json.loads(ob_raw)
            p_raw = await self.kv.get(f"price:{pair}")
            if p_raw:
                prices[pair] = p_raw.decode()

        if not prices:
            return

        # 2. Run inference + sign
        signed_trades = self.agent.process(orderbooks, prices)

        # 3. Submit to vault
        for trade in signed_trades:
            try:
                tx = await self.settlement.submit_trade(trade)
                logger.info(
                    "Trade executed: %s %s amount=%d nonce=%d tx=%s",
                    trade.payload.action,
                    trade.payload.pair,
                    trade.payload.amount,
                    trade.payload.nonce,
                    tx,
                )
            except Exception as e:
                logger.error("Settlement failed for nonce %d: %s", trade.payload.nonce, e)


async def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    config = {
        "vault_address": os.environ["VAULT_ADDRESS"],
        "target_pairs": os.environ["TARGET_PAIRS"].split(","),
        "max_position_size": int(os.environ.get("MAX_POSITION_SIZE", str(10 * 10**18))),
        "confidence_threshold": float(os.environ.get("CONFIDENCE_THRESHOLD", "0.70")),
        "max_drawdown": float(os.environ.get("MAX_DRAWDOWN", "0.05")),
    }

    agent = FlageAgent(
        model_path=os.environ["MODEL_PATH"],
        config=config,
        private_key=bytes.fromhex(os.environ["TEE_SIGNING_KEY"].lstrip("0x"))
        if os.environ.get("TEE_SIGNING_KEY")
        else None,
    )

    kv = KVLayerClient(
        kv_node_url=os.environ["OG_KV_NODE_URL"],
        stream_id=os.environ.get("OG_STREAM_ID", ""),
    )

    settlement = SettlementClient(
        rpc_url=os.environ["OG_RPC_URL"],
        vault_address=os.environ["VAULT_ADDRESS"],
        private_key=os.environ["SETTLEMENT_PRIVATE_KEY"],
    )

    runner = InferenceRunner(agent, kv, settlement)
    await runner.run()


if __name__ == "__main__":
    asyncio.run(main())
