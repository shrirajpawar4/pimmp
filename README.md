# pimpp

**Turn any API into a paid API.**

PIMPP puts a paid proxy in front of an existing HTTP API.
Clients get a standard `402 Payment Required` flow, pay with a configured MPP payment method, and PIMPP forwards the request to your upstream.

The repo currently includes `usdc-base` for USDC on Base and a custom `tempo-usd` rail for one-time Tempo TIP-20 stablecoin payments.

Your API stays the same.

## Why this exists

Charging for an API should not require rebuilding the API.

PIMPP is for the simple case:

- you already have an HTTP endpoint
- you want to charge per request
- you do not want to rewrite the origin
- you want agents and normal clients to use the same paid URL

## Install

```bash
npm install
```

## How one paid request works

```text
Client  ->  GET /p/abc123/weather?q=London
PIMPP   ->  402 Payment Required + payment details
Client  ->  pay with the endpoint's configured method
Client  ->  retry with payment proof
PIMPP   ->  verify payment, forward upstream
Origin  ->  200 OK
PIMPP   ->  200 OK + Payment-Receipt
```

For `usdc-base`, verification checks the submitted transaction receipt for the expected USDC transfer on Base. For `tempo-usd`, verification checks a Tempo TIP-20 `TransferWithMemo` receipt log whose memo binds the payment to the challenge.

## What is included

- Cloudflare Worker proxy for paid HTTP endpoints
- `@pimpp/usdc-base` payment method for USDC on Base
- `@pimpp/tempo-usd` payment method for one-time Tempo TIP-20 transfers
- `pimpp` CLI for registration and `402 -> pay -> retry`
- Redis-backed replay protection using atomic transaction-id claims
- agent demo showing how to call a paid endpoint from a tool

## Payment methods

- `usdc-base`: USDC transfer on Base, verified by transaction receipt.
- `tempo-usd`: TIP-20 stablecoin transfer on Tempo. PIMPP hashes the challenge id into a 32-byte memo and verifies the matching `TransferWithMemo` receipt log.

`tempo-usd` currently supports one-shot charges only.

## Tempo support status

This repo uses the custom method name `tempo-usd` for Tempo payments. It supports MPP `charge`-style one-time payments, where each paid request settles with a Tempo TIP-20 transfer.

It does not yet support MPP sessions, streamed payments, vouchers, fee sponsorship, pull-mode co-signing, or the canonical `mppx` `tempo()` integration. Modern Tempo MPP docs describe canonical `tempo` support in `mppx` for both charge and session intents; this repo has custom charge-only support today.

## Register an endpoint

```bash
npx tsx packages/pimpp-cli/src/cli.ts register \
  http://127.0.0.1:8787 \
  https://api.openai.com/v1 \
  --destination-wallet 0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00 \
  --template openai \
  --price 0.01 \
  --auth-header authorization="Bearer $OPENAI_API_KEY"
```

With explicit per-route prices:

```bash
npx tsx packages/pimpp-cli/src/cli.ts register \
  http://127.0.0.1:8787 \
  https://api.github.com \
  --destination-wallet 0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00 \
  --template github-rest \
  --price 0.01 \
  --route /search/issues=0.03 \
  --auth-header authorization="Bearer $GITHUB_TOKEN"
```

PIMPP returns a paid proxy base URL plus concrete paid route URLs:

```json
{
  "id": "abc123",
  "owner": {
    "type": "wallet",
    "chainId": 8453,
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00"
  },
  "proxiedBaseUrl": "https://pimpp.fun/p/abc123",
  "proxiedRoutes": {
    "/chat/completions": "https://pimpp.fun/p/abc123/chat/completions",
    "/embeddings": "https://pimpp.fun/p/abc123/embeddings",
    "/responses": "https://pimpp.fun/p/abc123/responses"
  },
  "instructions": "Call one of the proxied URLs. Unpaid requests receive a 402 MPP challenge."
}
```

The `POST /register` body is now:

```json
{
  "baseUrl": "https://api.example.com/v1",
  "destinationWallet": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "authHeader": {
    "name": "authorization",
    "value": "Bearer secret"
  },
  "routePricesUsdc": {
    "/search": "0.01",
    "/summarize": "0.02",
    "/export": "0.05"
  }
}
```

To register a Tempo endpoint, pass `payment.method: "tempo-usd"` with `recipient`, `token`, and optional `chainId` and `network: "tempo"`:

```json
{
  "baseUrl": "https://api.example.com/v1",
  "authHeader": {
    "name": "authorization",
    "value": "Bearer secret"
  },
  "routePricesUsdc": {
    "/search": "0.01"
  },
  "payment": {
    "method": "tempo-usd",
    "recipient": "0x0000000000000000000000000000000000000000",
    "token": "0x20c0000000000000000000000000000000000001",
    "chainId": 42431,
    "network": "tempo"
  }
}
```

`TEMPO_RPC_URL` is required for Tempo payments. `TEMPO_CHAIN_ID` is also required when a Tempo registration omits `payment.chainId`.

## Client

### CLI

```bash
PIMP_PRIVATE_KEY=0x... \
BASE_RPC_URL=https://mainnet.base.org \
npx tsx packages/pimpp-cli/src/cli.ts request \
  "https://pimpp.fun/p/abc123/weather?q=London"
```

The request command also supports gateway-style POST calls with headers and a body:

```bash
PIMP_PRIVATE_KEY=0x... \
BASE_RPC_URL=https://mainnet.base.org \
npx tsx packages/pimpp-cli/src/cli.ts request \
  "http://127.0.0.1:8787/g/openai/v1/responses" \
  --method POST \
  --header content-type=application/json \
  --body '{"model":"gpt-4.1-mini","input":"Say hello"}'
```

### TypeScript

```ts
import { Mppx } from 'mppx/client'
import { usdcBaseClient } from '@pimpp/usdc-base'

const mppx = Mppx.create({
  methods: [
    usdcBaseClient({
      privateKey: process.env.PIMP_PRIVATE_KEY as `0x${string}`,
      rpcUrl: process.env.BASE_RPC_URL,
    }),
  ],
  polyfill: false,
})

const response = await mppx.fetch('https://pimpp.fun/p/abc123/weather?q=London')
console.log(await response.text())
```

## Server

Worker routes:

- `/.well-known/payment`
- `GET /templates`
- `POST /register`
- `GET /gateway/services`
- `GET /gateway/services/llms.txt`
- `ALL /g/:serviceId/*`
- `GET /p/:id/status`
- `ALL /p/:id/*`

`GET /` returns a small service description:

```json
{
  "name": "pimpp",
  "description": "Transparent MPP payment proxy for HTTP APIs."
}
```

`GET /templates` returns the built-in registration presets:

```json
{
  "templates": [
    {
      "id": "openai",
      "label": "OpenAI-Compatible Proxy",
      "baseUrlExample": "https://api.openai.com/v1",
      "authHeaderName": "authorization",
      "routes": ["/chat/completions", "/embeddings", "/responses"]
    },
    {
      "id": "github-rest",
      "label": "GitHub REST Proxy",
      "baseUrlExample": "https://api.github.com",
      "authHeaderName": "authorization",
      "routes": ["/user", "/search/issues", "/search/repositories"]
    }
  ]
}
```

## Agent use

The model should not reason about the payment flow directly.

The clean pattern is:

1. make the PIMPP URL a tool
2. let the tool call the paid endpoint
3. let `mppx` handle `402 -> pay -> retry`
4. return only the upstream result to the model

Runnable demo:

```bash
PIMP_PRIVATE_KEY=0x... \
BASE_RPC_URL=https://mainnet.base.org \
npx tsx examples/agent-tool-demo.ts \
  "http://127.0.0.1:8787/p/<id>/tools/weather" \
  "What is the weather in London"
```

The installable Codex skill for the gateway lives in `skills/pimpp`.
Distribution details are documented in [docs/skill-install.md](/Users/shree/projects/pimmp/docs/skill-install.md).

## Local development

### Env

Copy `.env.example` and fill in:

```bash
cp .env.example .env
```

Core values:

```bash
PIMP_SECRET=                         # required
PIMP_DATA_KEY=                       # required, base64-encoded 32-byte key
BASE_RPC_URL=                        # required for usdc-base verification
PIMP_DESTINATION_WALLET=             # legacy/local fallback for old endpoint records
UPSTASH_REDIS_REST_URL=              # required for challenge and replay state
UPSTASH_REDIS_REST_TOKEN=            # required for challenge and replay state
TEMPO_RPC_URL=                       # required for tempo-usd verification
TEMPO_CHAIN_ID=                      # required when Tempo registration omits chainId
PIMP_PRIVATE_KEY=
```

Optional Worker configuration and defaults:

```bash
PIMP_CHALLENGE_TTL_SECONDS=300
PIMP_SPENT_TTL_SECONDS=86400
MPP_REGISTRY_URL=https://mpp.dev/api/services
GATEWAY_CACHE_KEY=gateway:services:v1
GATEWAY_CACHE_TTL_SECONDS=3600
PIMP_ENDPOINT_ID_LENGTH=10
PIMP_MIN_PRICE_USDC=0.001
PIMP_MAX_PRICE_USDC=100
PIMP_SERVICE_NAME=pimpp
PIMP_SERVICE_DESCRIPTION=Transparent MPP payment proxy for HTTP APIs with pluggable payment methods.
PIMP_REGISTER_INSTRUCTIONS=Call one of the proxied URLs. Unpaid requests receive a 402 MPP challenge.
USDC_CONFIRMATION_POLL_INTERVAL_MS=1000
USDC_CONFIRMATION_POLL_ATTEMPTS=10
USDC_CONFIRMATION_BLOCKS=1
```

TTL and polling values must be positive integers. Challenge state and replay prevention use Upstash Redis; replay prevention depends on the atomic `SET ... NX` claim for `spent:<txid>`.

`PIMP_ENDPOINT_ID_LENGTH` must be between 6 and 64. `PIMP_MIN_PRICE_USDC` and `PIMP_MAX_PRICE_USDC` set registration price policy and must be positive decimal USDC values.

`USDC_BASE_ADDRESS`, `USDC_BASE_CHAIN_ID`, `USDC_DECIMALS`, supported Tempo chain ids, and private-origin blocking rules are intentionally not environment-configurable because they are protocol and security invariants.

Generate local values:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

### Run

```bash
npm run dev
```

### CI/CD

GitHub Actions runs typecheck and tests on pull requests and pushes to `main`.
Pushes to `main` deploy the Worker after checks pass.

Set these GitHub repository secrets before enabling deploys:

```bash
CLOUDFLARE_ACCOUNT_ID=              # Cloudflare account id
CLOUDFLARE_API_TOKEN=               # API token allowed to deploy Workers and read/write KV config
ENDPOINTS_KV_NAMESPACE_ID=          # production ENDPOINTS KV namespace id
GATEWAY_CACHE_KV_NAMESPACE_ID=      # production GATEWAY_CACHE KV namespace id
```

Runtime Worker secrets still need to exist in Cloudflare before the deployed Worker can handle traffic:

```bash
wrangler secret put PIMP_SECRET
wrangler secret put PIMP_DATA_KEY
wrangler secret put BASE_RPC_URL
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put TEMPO_RPC_URL
wrangler secret put TEMPO_CHAIN_ID
```

`PIMP_DESTINATION_WALLET` is only a legacy/local fallback for old endpoint records. New registrations must pass `destinationWallet` or structured `payment.recipient`.

### Checks

```bash
npm run typecheck
npm test
```

## Architecture

```text
src/
  index.ts          Worker entrypoint
  proxy.ts          402, verify, forward flow
  registry.ts       endpoint registration and validation
  payment.ts        payment challenge and verification helpers
  replay.ts         replay protection
  payments/
    usdc-base.ts    pimpp adapter for USDC on Base
    tempo-usd.ts    pimpp adapter for custom Tempo TIP-20 payments
packages/
  pimpp-cli/        CLI for register, request, wallet whoami
  usdc-base/        USDC-on-Base payment method for mppx
  tempo-usd/        custom Tempo TIP-20 payment method for mppx
examples/
  agent-tool-demo.ts
```

## Current scope

- one-shot charge flow
- USDC-on-Base support
- custom Tempo TIP-20 one-time payment support
- no sessions yet
- no streaming yet
- no canonical Tempo `mppx` session support yet
- exact-path route pricing for registered paths
- upstreams must be internet reachable

## Security notes

- upstream auth data is encrypted before storage
- payment transaction ids are atomically claimed after verification to prevent replay
- Tempo transfer memos bind payments to the challenge id
- `Authorization` is stripped before forwarding upstream
- obvious localhost and private-network targets are blocked

## License

MIT
