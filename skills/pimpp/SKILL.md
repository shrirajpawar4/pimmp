---
name: pimpp
description: Access any MPP/x402 service through the unified PIMPP gateway at api.pimpp.dev. Use when calling paid APIs like Dune, Exa, Firecrawl, Alchemy, Nansen, Perplexity, OpenAI, Anthropic, and 40+ other services via x402 payment protocol.
---

# PIMPP Gateway Skill

Use this skill when an agent or tool should call an MPP/x402 service through the unified PIMPP gateway instead of integrating each upstream separately.

## Gateway pattern

PIMPP exposes the live `mpp.dev` service registry through one gateway:

- `GET https://api.pimpp.dev/gateway/services` for the JSON service catalog
- `GET https://api.pimpp.dev/gateway/services/llms.txt` for a plaintext agent directory
- `ALL https://api.pimpp.dev/g/<serviceId>/...` to proxy requests to the matching upstream service

PIMPP does not run a wallet server-side. It forwards requests as-is. If the upstream returns `402 Payment Required`, that `402` is passed back unchanged. The client wallet pays the upstream directly, retries through PIMPP, and PIMPP forwards the proof headers intact.

## Common gateway paths

- OpenAI: `https://api.pimpp.dev/g/openai/...`
- Anthropic: `https://api.pimpp.dev/g/anthropic/...`
- Perplexity: `https://api.pimpp.dev/g/perplexity/...`
- Exa: `https://api.pimpp.dev/g/exa/...`
- Dune: `https://api.pimpp.dev/g/dune/...`
- Firecrawl: `https://api.pimpp.dev/g/firecrawl/...`
- Alchemy: `https://api.pimpp.dev/g/alchemy/...`
- Nansen: `https://api.pimpp.dev/g/nansen/...`

Discover the current full list from `/gateway/services` or `/gateway/services/llms.txt` instead of hardcoding the catalog.

## Fetch pattern with automatic payment

Use `mppx` on the client. Let the wallet handle `402 -> pay -> retry`.

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

async function fetchWith402Retry(url: string, init?: RequestInit) {
  const response = await mppx.fetch(url, init)
  return response
}

const response = await fetchWith402Retry(
  'https://api.pimpp.dev/g/openai/v1/chat/completions',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'Say hello' }],
    }),
  },
)

console.log(await response.text())
```

## Rules

- Use `/g/<serviceId>` as the stable integration surface.
- Do not build payment proofs in the model prompt.
- Let `mppx` and the configured wallet method handle payment automatically.
- Preserve upstream request headers and body on retries.
- Use the gateway registry endpoints as the source of truth for available services.
