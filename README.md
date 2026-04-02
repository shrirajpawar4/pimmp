# pimpp

Proxied Implementation of Machine Payments.

Transparent MPP payment proxy for HTTP APIs.
No account. No Stripe. USDC on Base.

## What this repo contains

- Cloudflare Worker proxy for wrapping any HTTP API in an MPP `402` payment flow
- reusable `@pimpp/usdc-base` package built on `mppx`
- `pimpp` CLI for `402 -> pay -> retry`

This is the fast, cheap, proxy-first counterpart to `zimppy`:
- same integration style
- no privacy rail
- Base mainnet + USDC
- one-shot charges in v1

## How it works

1. An API owner registers an upstream endpoint, price, and payout wallet.
2. The owner shares the proxied URL instead of the raw origin.
3. A client calls that URL and gets `402 Payment Required`.
4. A compatible MPP client pays USDC on Base and retries with `Authorization: Payment ...`.
5. The proxy verifies the transaction and forwards the request upstream.

The origin API does not need to know anything about MPP.

## Quickstart

### 1. Install

```bash
npm install
```

### 2. Configure env

Copy `.env.example` and fill in real values:

```bash
cp .env.example .env
```

Required values:

```bash
PIMP_SECRET=
PIMP_DATA_KEY=
BASE_RPC_URL=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
PIMP_PRIVATE_KEY=
```

Notes:
- `PIMP_SECRET` is used by `mppx` to bind challenges.
- `PIMP_DATA_KEY` must be a base64-encoded 32-byte AES key.
- `PIMP_PRIVATE_KEY` is only needed for CLI payment flows.

Generate sane local values:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

### 3. Configure Wrangler

Edit [wrangler.toml](/Users/shree/projects/pimmp/wrangler.toml):
- replace the placeholder KV namespace id
- add any production bindings you want before deploy

### 4. Run locally

```bash
npm run dev
```

## Local test flow

### Register an endpoint

```bash
curl -X POST http://127.0.0.1:8787/register \
  -H 'content-type: application/json' \
  -d '{
    "originUrl": "https://httpbin.org/anything",
    "priceUsdc": "0.01",
    "destinationWallet": "0x742d35Cc6634c0532925a3b844Bc454e4438f44e"
  }'
```

Optional upstream auth can be stored server-side:

```json
{
  "upstreamHeaders": { "x-api-key": "secret" },
  "upstreamQuery": { "api_key": "secret" }
}
```

### Confirm the unpaid challenge

```bash
curl -i http://127.0.0.1:8787/p/<id>/demo
```

Expected:
- status `402`
- `WWW-Authenticate: Payment ...`

### Pay and retry with the CLI

```bash
PIMP_PRIVATE_KEY=0x... \
BASE_RPC_URL=https://mainnet.base.org \
node packages/pimpp-cli/src/cli.ts request "http://127.0.0.1:8787/p/<id>/demo"
```

### Check endpoint status

```bash
curl http://127.0.0.1:8787/p/<id>/status
```

## Provider integration

API owners integrate by registering an endpoint:

```bash
POST /register
{
  "originUrl": "https://api.example.com/v1",
  "priceUsdc": "0.01",
  "destinationWallet": "0x..."
}
```

Response:

```json
{
  "id": "abc123",
  "proxiedUrl": "https://pimpp.fun/p/abc123",
  "instructions": "Call the proxied URL. Unpaid requests receive a 402 MPP challenge."
}
```

No origin-side code changes are required.

## Client integration

### CLI

```bash
npx pimpp request https://pimpp.fun/p/abc123/weather?q=London
```

### SDK

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

## Development

```bash
npm run typecheck
npm test
```

CI runs both checks on every push and pull request via GitHub Actions.

## Security model

- replay protection uses Upstash Redis with `spent:{txid}` keys
- short-lived challenge state uses Redis with `challenge:{id}` keys
- upstream secret headers/query params are encrypted before KV storage
- the proxy strips `Authorization` before forwarding to the origin
- SSRF mitigation currently blocks obvious localhost/private/link-local targets

## Current limits

- v1 is one-shot only: one Base USDC transfer per paid request
- no sessions or streaming yet
- no fee collection yet
- SSRF protection is hostname/IP based, not full DNS rebinding protection
- no auth on endpoint registration in v1

## Before going public

Replace these placeholders first:
- GitHub URLs in `package.json` files
- `wrangler.toml` KV namespace id
- any example wallet addresses you do not want public-facing

Recommended before the tweet:
- add a real deploy URL to this README
- record a 30-second demo clip of register -> 402 -> pay -> response
- test one public upstream and one secret-bearing upstream

## License

MIT
