# @pimpp/usdc-base

MPP payment method for USDC on Base.

Server:

```ts
import { Mppx } from 'mppx/server'
import { usdcBase } from '@pimpp/usdc-base'

const mppx = Mppx.create({
  methods: [usdcBase({ rpcUrl: process.env.BASE_RPC_URL })],
  realm: 'api.example.com',
  secretKey: process.env.PIMP_SECRET,
})
```

Client:

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
```
