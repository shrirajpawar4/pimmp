# pimpp

CLI for MPP-compatible USDC-on-Base endpoints.

Register an origin and get back a paid proxy URL:

```bash
npx tsx packages/pimpp-cli/src/cli.ts register \
  http://127.0.0.1:8787 \
  https://api.openai.com/v1 \
  --template openai \
  --price 0.01 \
  --auth-header authorization="Bearer $OPENAI_API_KEY"
```

Set explicit per-route pricing with or without a template:

```bash
npx tsx packages/pimpp-cli/src/cli.ts register \
  http://127.0.0.1:8787 \
  https://api.github.com \
  --template github-rest \
  --price 0.01 \
  --route /search/issues=0.03 \
  --auth-header authorization="Bearer $GITHUB_TOKEN"
```

The same built-in templates are available from the worker at `GET /templates`.

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
