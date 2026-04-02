---
name: pimpp-agent
description: Use this skill when an agent needs to call a PIMPP-paid endpoint or explain how to integrate an agent tool with PIMPP. Prefer tool-mediated calls to paid URLs, let mppx handle 402-pay-retry, and keep payment details out of the model prompt.
---

# PIMPP Agent Skill

Use this when working with paid endpoints protected by PIMPP.

## Goal

Make the agent call a paid HTTP endpoint without making the model reason about payment mechanics.

## Default pattern

1. Treat the PIMPP URL as a tool endpoint.
2. Build the request exactly as you would for a normal HTTP API.
3. Use `mppx` with `usdcBaseClient(...)` to call the URL.
4. Let the client handle `402 -> pay -> retry`.
5. Return the upstream result to the model.

## TypeScript pattern

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

const response = await mppx.fetch(paidUrl)
const text = await response.text()
```

## Rules

- Do not ask the model to construct payment proofs.
- Do not expose upstream secret headers or query params to the model.
- Do not send raw wallet secrets anywhere except the payment client.
- Keep prompts focused on the business task, not the payment protocol.
- If the endpoint returns JSON, parse it in the tool and return only the fields the model needs.

## Inputs you need

- `PIMP_PRIVATE_KEY`
- `BASE_RPC_URL`
- a PIMPP proxy URL such as `https://.../p/<id>/...`

## Good use cases

- paid agent tools
- MCP servers calling paid upstream APIs
- wrappers around existing APIs that now require `402` payment

## Reference

See [examples/agent-tool-demo.ts](/Users/shree/projects/pimmp/examples/agent-tool-demo.ts) for a working example.
