#!/usr/bin/env node

import { Mppx } from 'mppx/client'
import { privateKeyToAccount } from 'viem/accounts'

import { usdcBaseClient } from '@pimpp/usdc-base'

function getEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

async function main() {
  const [, , command, ...args] = process.argv

  if (command === 'request') {
    const target = args[0]
    if (!target) {
      throw new Error('Usage: pimpp request <url>')
    }

    const mppx = Mppx.create({
      methods: [
        usdcBaseClient({
          privateKey: getEnv('PIMP_PRIVATE_KEY') as `0x${string}`,
          rpcUrl: getEnv('BASE_RPC_URL'),
        }),
      ],
      polyfill: false,
    })

    const response = await mppx.fetch(target)
    const body = await response.text()
    process.stdout.write(body)
    return
  }

  if (command === 'wallet' && args[0] === 'whoami') {
    const account = privateKeyToAccount(getEnv('PIMP_PRIVATE_KEY') as `0x${string}`)
    process.stdout.write(`${account.address}\n`)
    return
  }

  throw new Error('Usage: pimpp request <url> | pimpp wallet whoami')
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
