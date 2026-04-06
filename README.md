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
  https://api.openai.com/v1 \
  --template openai \
  --price 0.01 \
  --auth-header authorization="Bearer $OPENAI_API_KEY"
```

With explicit per-route prices:

```bash
npx tsx packages/pimpp-cli/src/cli.ts register \
  http://127.0.0.1:8787 \
  https://api.github.com \
  --template github-rest \
  --price 0.01 \
  --route /search/issues=0.03 \
  --auth-header authorization="Bearer $GITHUB_TOKEN"
```

PIMPP returns a paid proxy base URL plus concrete paid route URLs:

```json
{
  "id": "abc123",
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
  "description": "Transparent MPP payment proxy for HTTP APIs using USDC on Base."
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

Required values:

```bash
PIMP_SECRET=
PIMP_DATA_KEY=
BASE_RPC_URL=
PIMP_DESTINATION_WALLET=
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
- exact-path route pricing for registered paths
- upstreams must be internet reachable

## Security notes

- upstream auth data is encrypted before storage
- replay protection uses Redis-backed transaction tracking
- `Authorization` is stripped before forwarding upstream
- obvious localhost and private-network targets are blocked

## License

MIT
