# PIMPP Skill Install

The installable Codex skill lives at `skills/pimpp`.

Recommended install command after the repo is pushed:

```bash
npx skills add shrirajpawar4/pimmp --skill pimpp
```

GitHub-path based installers can also target:

```text
https://github.com/shrirajpawar4/pimmp/tree/main/skills/pimpp
```

Use `--skill pimpp` even though there is only one skill today. It keeps the install explicit and stable if more skills are added later.

Bare-name installs such as `npx skills add pimpp` still require a curated index or registry entry.

## Tester Flow

1. Install the skill:

```bash
npx skills add shrirajpawar4/pimmp --skill pimpp
```

2. Restart Codex.

3. Set wallet env in the shell/session used for paid calls:

```bash
export PIMP_PRIVATE_KEY=0x...
export BASE_RPC_URL=https://mainnet.base.org
```

4. Verify the live gateway:

```bash
curl -i https://api.pimpp.dev/gateway/services
curl -i https://api.pimpp.dev/gateway/services/llms.txt
```

5. Verify unpaid passthrough:

```bash
curl -i -X POST https://api.pimpp.dev/g/openai/v1/responses \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4.1-mini","input":"Say hello"}'
```

Expected result: `402 Payment Required`.

6. Verify paid client flow with the CLI:

```bash
PIMP_PRIVATE_KEY=0x... \
BASE_RPC_URL=https://mainnet.base.org \
npx tsx packages/pimpp-cli/src/cli.ts request \
  "https://api.pimpp.dev/g/openai/v1/responses" \
  --method POST \
  --header content-type=application/json \
  --body '{"model":"gpt-4.1-mini","input":"Say hello"}'
```

Expected result: the upstream response body.

## Maintainer Deploy Workflow

Keep the committed `wrangler.toml` clean with placeholder namespace IDs.

Store real deploy config in a local file that is not committed:

- `wrangler.local.toml`
- or copy from `wrangler.local.toml.example`

Deploy flow:

```bash
cp wrangler.local.toml wrangler.toml
npm run deploy
git checkout -- wrangler.toml
```

This keeps production namespace IDs out of the repository while preserving a simple local redeploy flow.
