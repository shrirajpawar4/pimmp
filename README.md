# pimpp

**Turn any API into a paid API.**

PIMPP puts a paid proxy in front of an existing HTTP API.
Clients get a standard `402 Payment Required` flow, pay in USDC on Base, and PIMPP forwards the request to your upstream.

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
Client  ->  pay in USDC on Base
Client  ->  retry with payment proof
PIMPP   ->  verify payment, forward upstream
Origin  ->  200 OK
PIMPP   ->  200 OK + Payment-Receipt
```

## What is included

- Cloudflare Worker proxy for paid HTTP endpoints
- `@pimpp/usdc-base` payment method for USDC on Base
- `pimpp` CLI for registration and `402 -> pay -> retry`
- agent demo showing how to call a paid endpoint from a tool

## Register an endpoint

```bash
npx tsx packages/pimpp-cli/src/cli.ts register \
  http://127.0.0.1:8787 \
  https://api.example.com/v1 \
  0.01 \
  0x742d35Cc6634c0532925a3b844Bc454e4438f44e
```

With upstream auth kept on the proxy:

```bash
npx tsx packages/pimpp-cli/src/cli.ts register \
  http://127.0.0.1:8787 \
  https://api.example.com/v1 \
  0.01 \
  0x742d35Cc6634c0532925a3b844Bc454e4438f44e \
  --upstream-header x-api-key=secret \
  --upstream-query account_id=demo
```

PIMPP returns a paid proxy URL like:

```json
{
  "id": "abc123",
  "proxiedUrl": "https://pimpp.fun/p/abc123",
  "instructions": "Call the proxied URL. Unpaid requests receive a 402 MPP challenge."
}
```

## Client

### CLI

```bash
PIMP_PRIVATE_KEY=0x... \
BASE_RPC_URL=https://mainnet.base.org \
npx tsx packages/pimpp-cli/src/cli.ts request \
  "https://pimpp.fun/p/abc123/weather?q=London"
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
- `POST /register`
- `GET /p/:id/status`
- `ALL /p/:id/*`

`GET /` returns a small service description:

```json
{
  "name": "pimpp",
  "description": "Transparent MPP payment proxy for HTTP APIs using USDC on Base."
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

## Local development

### Env

Copy `.env.example` and fill in:

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

Generate local values:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

### Run

```bash
npm run dev
```

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
packages/
  pimpp-cli/        CLI for register, request, wallet whoami
  usdc-base/        USDC-on-Base payment method for mppx
examples/
  agent-tool-demo.ts
```

## Current scope

- one-shot charge flow
- no sessions yet
- no streaming yet
- upstreams must be internet reachable

## Security notes

- upstream auth data is encrypted before storage
- replay protection uses Redis-backed transaction tracking
- `Authorization` is stripped before forwarding upstream
- obvious localhost and private-network targets are blocked

## License

MIT
