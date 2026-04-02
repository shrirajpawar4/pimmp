# pimpp

CLI for MPP-compatible USDC-on-Base endpoints.

Register an origin and get back a paid proxy URL:

```bash
npx tsx packages/pimpp-cli/src/cli.ts register \
  http://127.0.0.1:8787 \
  https://httpbin.org/anything \
  0.01 \
  0x742d35Cc6634c0532925a3b844Bc454e4438f44e
```

Include provider-side auth without exposing it to clients:

```bash
npx tsx packages/pimpp-cli/src/cli.ts register \
  http://127.0.0.1:8787 \
  https://api.example.com/v1 \
  0.01 \
  0x742d35Cc6634c0532925a3b844Bc454e4438f44e \
  --upstream-header x-api-key=secret \
  --upstream-query account_id=demo
```

Pay a proxied endpoint:

```bash
PIMP_PRIVATE_KEY=0x... \
BASE_RPC_URL=https://mainnet.base.org \
npx pimpp request https://pimpp.fun/p/abc123/weather?q=London
```

Show the configured wallet address:

```bash
PIMP_PRIVATE_KEY=0x... npx pimpp wallet whoami
```
