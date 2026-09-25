.PHONY: test-contracts build-wasm deploy-testnet verify-testnet fmt lint \
	test-ts lint-ts build-ts build-sdk test check

CONTRACT_PACKAGES := \
	-p sorogov-governor \
	-p sorogov-timelock \
	-p sorogov-token-votes \
	-p sorogov-governor-factory \
	-p sorogov-treasury \
	-p sorogov-liquidity \
	-p sorogov-co-sponsorship \
	-p sorogov-conviction-voting \
	-p sorogov-token-votes-wrapper \
	-p sorogov-signal-anchor \
	-p sorogov-proposal-bonds \
	-p sorogov-treasury-strategies \
	-p sorogov-optimistic-governor \
	-p sorogov-voting-rewards

test-contracts: build-wasm
	cargo test $(CONTRACT_PACKAGES) -- --nocapture

build-wasm:
	cargo build --release --target wasm32v1-none $(CONTRACT_PACKAGES)

deploy-testnet:
	./scripts/deploy-testnet.sh

verify-testnet:
	./scripts/verify-deployment.sh

fmt:
	cargo fmt --all

lint:
	cargo clippy $(CONTRACT_PACKAGES) -- -D warnings

# ── TypeScript workspaces (sdk/, app/, backend/, packages/*, tools/simulation) ──
# Mirrors the per-package commands CI runs in .github/workflows/{frontend,backend,sdk,cli,indexer}.yml,
# so `make check` locally matches what CI checks before you push.

test-ts: build-sdk
	pnpm -r run test

lint-ts: build-sdk
	# sdk's own `lint` script has no eslint config committed, so it always
	# fails — matches sdk.yml's Lint step, which is `continue-on-error: true`
	# for the same reason. Every other workspace's lint runs fatally.
	pnpm -r --if-present --filter '!@nebgov/sdk' run lint
	-pnpm --filter @nebgov/sdk run lint
	pnpm --filter nebgov-app exec tsc --noEmit

# Every dependent workspace (app, backend, cli, indexer, tools/simulation) imports
# @nebgov/sdk from its built dist/, same as CI's "Build SDK" step in every
# workflow — lint/build/test elsewhere fail against a stale or missing dist otherwise.
build-sdk:
	pnpm --filter @nebgov/sdk run build

build-ts:
	pnpm -r run build

test: test-contracts test-ts

check: lint lint-ts build-ts test
