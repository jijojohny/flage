# ─── Flage Local Validation ───────────────────────────────────────────────────
.PHONY: help install test test-contracts test-agent test-storage test-settlement \
        test-dashboard anvil deploy-local kv-server seed-data agent dashboard \
        settlement deploy-testnet agent-testnet dashboard-testnet settlement-testnet \
        docker-up-testnet docker-down-testnet check-deps clean

SHELL := /bin/bash
ROOT  := $(shell pwd)
# Pick up Foundry and the highest available nvm Node.js 20.x
NVM_NODE20 := $(shell ls -d $(HOME)/.nvm/versions/node/v20.*/bin 2>/dev/null | sort -V | tail -1)
export PATH := $(HOME)/.foundry/bin:$(NVM_NODE20):$(PATH)

# ─── Help ─────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  Flage local validation commands"
	@echo ""
	@echo "  Setup"
	@echo "    make install          Install all package dependencies"
	@echo "    make check-deps       Verify required tools are installed"
	@echo "    make dummy-model      Create random TorchScript model for testing"
	@echo ""
	@echo "  Run tests (no live infra needed)"
	@echo "    make test             Run all test suites"
	@echo "    make test-contracts   forge test (Foundry)"
	@echo "    make test-agent       pytest (Python)"
	@echo "    make test-storage     jest  (storage-client)"
	@echo "    make test-settlement  jest  (settlement)"
	@echo ""
	@echo "  Local stack (run in separate terminals)"
	@echo "    make anvil            Start local EVM (terminal 1)"
	@echo "    make deploy-local     Deploy contracts to anvil (terminal 2)"
	@echo "    make kv-server        Start mock 0G KV server (terminal 3)"
	@echo "    make seed-data        Feed synthetic prices into KV (terminal 4)"
	@echo "    make agent            Run trading agent (terminal 5)"
	@echo "    make dashboard        Start Next.js dashboard (terminal 6)"
	@echo ""
	@echo "  All-in-one (local)"
	@echo "    make docker-up        Start full stack via docker-compose"
	@echo "    make docker-down      Stop docker-compose stack"
	@echo ""
	@echo "  Testnet (0G Galileo, chain 16602)"
	@echo "    make deploy-testnet   Deploy contracts — needs DEPLOYER_PRIVATE_KEY"
	@echo "    make agent-testnet    Run agent against testnet (loads .env.testnet)"
	@echo "    make settlement-testnet  Run settlement against testnet"
	@echo "    make dashboard-testnet   Start dashboard pointed at testnet"
	@echo "    make docker-up-testnet   Start agent+settlement+dashboard via compose"
	@echo "    make docker-down-testnet Stop testnet compose stack"
	@echo ""

# ─── Dependency check ─────────────────────────────────────────────────────────
check-deps:
	@echo "Checking required tools..."
	@command -v forge   >/dev/null 2>&1 || (echo "ERROR: forge not found — install Foundry: https://getfoundry.sh" && exit 1)
	@command -v anvil   >/dev/null 2>&1 || (echo "ERROR: anvil not found — install Foundry: https://getfoundry.sh" && exit 1)
	@command -v cast    >/dev/null 2>&1 || (echo "ERROR: cast not found — install Foundry: https://getfoundry.sh" && exit 1)
	@command -v python3 >/dev/null 2>&1 || (echo "ERROR: python3 not found" && exit 1)
	@command -v node    >/dev/null 2>&1 || (echo "ERROR: node not found — install Node.js 20+" && exit 1)
	@command -v npm     >/dev/null 2>&1 || (echo "ERROR: npm not found" && exit 1)
	@python3 -c "import sys; assert sys.version_info >= (3,11)" 2>/dev/null || (echo "ERROR: Python 3.11+ required" && exit 1)
	@node -e "const v=process.versions.node.split('.')[0]; if(v<20) process.exit(1)" 2>/dev/null || (echo "ERROR: Node.js 20+ required" && exit 1)
	@echo "All dependencies satisfied."

# ─── Install ──────────────────────────────────────────────────────────────────
install: check-deps
	@echo "── Installing npm workspaces ──"
	npm install
	@echo "── Installing contract dependencies ──"
	cd packages/contracts && forge install --no-git
	@echo "── Installing Python agent ──"
	cd packages/agent && pip install -e ".[dev]"

dummy-model:
	@echo "── Creating dummy TorchScript model ──"
	python3 scripts/create_dummy_model.py

# ─── Tests (no live infra needed) ─────────────────────────────────────────────
test: test-contracts test-agent test-storage test-settlement

test-contracts:
	@echo "══ contracts (forge test) ══"
	cd packages/contracts && forge test -vvv

test-contracts-fuzz:
	@echo "══ contracts fuzz (1000 runs) ══"
	cd packages/contracts && forge test --match-test testFuzz -vvv --fuzz-runs 1000

test-agent:
	@echo "══ agent (pytest) ══"
	cd packages/agent && pytest tests/ -v --tb=short

test-storage:
	@echo "══ storage-client (jest) ══"
	cd packages/storage-client && npm test

test-settlement:
	@echo "══ settlement (jest) ══"
	cd packages/settlement && npm test -- --coverage

test-lint:
	@echo "── Lint: contracts ──"
	cd packages/contracts && forge fmt --check
	@echo "── Lint: agent ──"
	cd packages/agent && ruff check src/
	@echo "── Lint: storage-client ──"
	cd packages/storage-client && npm run lint || true
	@echo "── Lint: settlement ──"
	cd packages/settlement && npm run lint || true

# ─── Local stack ──────────────────────────────────────────────────────────────
anvil:
	@echo "Starting Anvil on :8545 (chain-id 31337, 1s blocks)"
	anvil \
	  --host 0.0.0.0 \
	  --port 8545 \
	  --chain-id 31337 \
	  --block-time 1 \
	  --accounts 10 \
	  --balance 10000 \
	  --mnemonic "test test test test test test test test test test test junk"

deploy-local:
	@echo "Deploying to local Anvil..."
	@bash scripts/deploy_local.sh
	@echo ""
	@echo "Run: source .env.local  to load env vars into current shell"

kv-server:
	@echo "Starting mock 0G KV server on :6789"
	python3 scripts/mock_kv_server.py --port 6789

seed-data:
	@[ -f .env.local ] && export $$(grep -v '^#' .env.local | xargs) ; \
	echo "Seeding market data → http://localhost:6789" ; \
	python3 scripts/seed_market_data.py \
	  --kv-url $${OG_KV_NODE_URL:-http://localhost:6789} \
	  --stream-id $${OG_STREAM_ID:-local-stream} \
	  --pairs $${TARGET_PAIRS:-ETH/USDC,BTC/USDC} \
	  --interval 0.5

agent:
	@[ -f .env.local ] && export $$(grep -v '^#' .env.local | xargs) ; \
	[ -f scripts/dummy_model/model.pt ] || $(MAKE) dummy-model ; \
	MODEL_PATH=scripts/dummy_model/model.pt \
	TEE_HARDWARE_AVAILABLE=0 \
	DEVICE=cpu \
	  python3 packages/agent/src/runner.py

dashboard:
	@[ -f .env.local ] && export $$(grep -v '^#' .env.local | xargs) ; \
	cd packages/dashboard && npm run dev

settlement:
	@[ -f .env.local ] && export $$(grep -v '^#' .env.local | xargs) ; \
	cd packages/settlement && npm run dev

# ─── Docker ───────────────────────────────────────────────────────────────────
docker-up:
	@[ -f .env.local ] && cp .env.local .env || true
	docker compose up --build

docker-down:
	docker compose down -v

# ─── Testnet (0G Galileo) ─────────────────────────────────────────────────────
deploy-testnet:
	@[ -n "$(DEPLOYER_PRIVATE_KEY)" ] || (echo "ERROR: set DEPLOYER_PRIVATE_KEY=0x..." && exit 1)
	DEPLOYER_PRIVATE_KEY=$(DEPLOYER_PRIVATE_KEY) bash scripts/deploy_testnet.sh
	@echo ""
	@echo "Run: source .env.testnet"

# Copy NEXT_PUBLIC_* vars into dashboard/.env.local so Next.js picks them up
_sync-dashboard-testnet:
	@grep '^NEXT_PUBLIC_' .env.testnet > packages/dashboard/.env.local
	@echo "Synced NEXT_PUBLIC_* vars → packages/dashboard/.env.local"

agent-testnet:
	@[ -f .env.testnet ] || (echo "ERROR: .env.testnet not found — run make deploy-testnet first" && exit 1)
	@[ -f scripts/dummy_model/model.pt ] || $(MAKE) dummy-model
	@export $$(grep -v '^#' .env.testnet | xargs) ; \
	MODEL_PATH=scripts/dummy_model/model.pt \
	  python3 packages/agent/src/runner.py

settlement-testnet:
	@[ -f .env.testnet ] || (echo "ERROR: .env.testnet not found — run make deploy-testnet first" && exit 1)
	@export $$(grep -v '^#' .env.testnet | xargs) ; \
	cd packages/settlement && npm run dev

dashboard-testnet: _sync-dashboard-testnet
	@[ -f .env.testnet ] || (echo "ERROR: .env.testnet not found — run make deploy-testnet first" && exit 1)
	@export $$(grep -v '^#' .env.testnet | xargs) ; \
	cd packages/dashboard && npm run dev

docker-up-testnet:
	@[ -f .env.testnet ] || (echo "ERROR: .env.testnet not found — run make deploy-testnet first" && exit 1)
	cp .env.testnet .env
	docker compose -f docker-compose.testnet.yml up --build

docker-down-testnet:
	docker compose -f docker-compose.testnet.yml down -v

# ─── Clean ────────────────────────────────────────────────────────────────────
clean:
	cd packages/contracts  && forge clean
	cd packages/storage-client && npm run clean || true
	cd packages/settlement && npm run clean || true
	cd packages/dashboard  && npm run clean || true
	rm -rf scripts/dummy_model
	rm -f .env.local
