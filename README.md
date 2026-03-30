# flage — AI Arbitrage & Quant Protocol

Institutional-grade autonomous trading system built on the [0G](https://0g.ai) decentralized AI operating system. Executes arbitrage and quant strategies with zero MEV exposure — every trade decision is generated inside a hardware-sealed TEE enclave and verified on-chain via Proof-of-Inference.

## Architecture

```
[ERC-7857 iNFT]  →  [0G Storage]  →  [TEE Enclave]  →  [PoI Signature]  →  [0G Chain Vault]
  Agent IP            Data              Sealed              Tamper-proof      Settlement +
  Protection          Pipeline          Inference           Trade Output      DEX Routing
```

| Layer | Technology | Purpose |
|---|---|---|
| Identity | ERC-7857 iNFT on 0G Chain | Encrypted model ownership |
| Data | 0G Storage Log + KV Layer | Historical archive + real-time feeds |
| Availability | 0G DA (50 Gbps) | Market data throughput |
| Compute | 0G CVM (Intel TDX + NVIDIA H100) | Sealed strategy execution |
| Proof | Enclave-born ECDSA key | Tamper-proof trade signing |
| Settlement | Solidity Vault on 0G Chain | Capital management + DEX routing |

## Repository Structure

```
og-darkpool/
├── packages/
│   ├── contracts/                # Solidity (Foundry)
│   │   ├── src/
│   │   │   ├── interfaces/IERC7857.sol
│   │   │   ├── FlageAgentNFT.sol    # ERC-7857 iNFT
│   │   │   ├── FlageVerifier.sol    # TEE proof verifier
│   │   │   ├── FlageVault.sol       # Capital + trade execution
│   │   │   └── DEXRouter.sol         # Multi-DEX routing
│   │   ├── script/Deploy.s.sol
│   │   └── test/FlageVault.t.sol
│   ├── agent/                    # Python (TEE runtime)
│   │   └── src/
│   │       ├── agent.py              # Model + PoI signing
│   │       └── runner.py             # KV reader + settlement submitter
│   ├── storage-client/           # TypeScript (0G Storage SDK)
│   │   └── src/
│   │       ├── log-layer/archiver.ts # Historical data archival
│   │       ├── kv-layer/server.ts    # Real-time data serving
│   │       └── connectors/           # Binance + DEX event feeds
│   ├── settlement/               # TypeScript (on-chain submission)
│   └── dashboard/                # Next.js monitoring UI
└── .github/workflows/ci.yml      # CI/CD pipeline
```

## Quick Start

### Prerequisites
- [Foundry](https://book.getfoundry.sh) — for smart contracts
- Node.js 20+ — for TypeScript packages
- Python 3.11+ — for the trading agent

### 1. Clone and install

```bash
git clone <repo-url> og-darkpool
cd og-darkpool
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your keys and addresses
```

### 3. Deploy contracts (Galileo testnet)

```bash
cd packages/contracts
forge install
forge test                              # Run tests first
forge script script/Deploy.s.sol \
  --rpc-url https://evmrpc-testnet.0g.ai \
  --broadcast
```

### 4. Start data pipeline

```bash
cd packages/storage-client
npm install && npm run build
npm start
```

### 5. Start trading agent

```bash
cd packages/agent
pip install -e ".[train]"
MODEL_PATH=./models/flage_v1.pt \
VAULT_ADDRESS=0x... \
TARGET_PAIRS=ETH/USDC,BTC/USDC \
OG_RPC_URL=https://evmrpc.0g.ai \
OG_KV_NODE_URL=... \
python src/runner.py
```

## Network

| Network | Chain ID | RPC |
|---|---|---|
| 0G Mainnet | 16661 | `https://evmrpc.0g.ai` |
| Galileo Testnet | 16602 | `https://evmrpc-testnet.0g.ai` |

Testnet faucet: https://faucet.0g.ai

## Security

- Model weights encrypted via ERC-7857; stored on 0G Storage
- Strategy runs inside Intel TDX + NVIDIA H100 CC mode TEE
- Trade outputs signed with enclave-born key (never leaves TEE)
- On-chain signature verification before any capital movement
- Monotonic nonces + deadlines prevent replay attacks
- Per-pair position limits and daily volume caps

## License

MIT
