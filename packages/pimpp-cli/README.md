# pimpp

CLI for MPP-compatible USDC-on-Base endpoints.

```bash
PIMP_PRIVATE_KEY=0x... \
BASE_RPC_URL=https://mainnet.base.org \
npx pimpp request https://pimpp.fun/p/abc123/weather?q=London
```

Show the configured wallet address:

```bash
PIMP_PRIVATE_KEY=0x... npx pimpp wallet whoami
```
