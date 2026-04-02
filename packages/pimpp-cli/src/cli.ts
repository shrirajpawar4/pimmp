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

  if (command === 'register') {
    const options = parseRegisterArgs(args)
    const response = await fetch(new URL('/register', options.workerUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        destinationWallet: options.destinationWallet,
        originUrl: options.originUrl,
        priceUsdc: options.priceUsdc,
        ...(Object.keys(options.upstreamHeaders).length
          ? { upstreamHeaders: options.upstreamHeaders }
          : {}),
        ...(Object.keys(options.upstreamQuery).length
          ? { upstreamQuery: options.upstreamQuery }
          : {}),
      }),
    })

    const body = await response.text()
    process.stdout.write(body)
    if (!body.endsWith('\n')) {
      process.stdout.write('\n')
    }
    if (!response.ok) {
      process.exit(1)
    }
    return
  }

  if (command === 'wallet' && args[0] === 'whoami') {
    const account = privateKeyToAccount(getEnv('PIMP_PRIVATE_KEY') as `0x${string}`)
    process.stdout.write(`${account.address}\n`)
    return
  }

  throw new Error(usage())
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})

function parseRegisterArgs(args: string[]) {
  if (args.length < 4) {
    throw new Error(
      'Usage: pimpp register <worker-url> <origin-url> <price-usdc> <destination-wallet> [--upstream-header name=value] [--upstream-query name=value]',
    )
  }

  const [workerUrl, originUrl, priceUsdc, destinationWallet, ...rest] = args
  const upstreamHeaders: Record<string, string> = {}
  const upstreamQuery: Record<string, string> = {}

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index]
    const value = rest[index + 1]
    if (flag !== '--upstream-header' && flag !== '--upstream-query') {
      throw new Error(`Unknown option: ${flag}`)
    }
    if (!value) {
      throw new Error(`Missing value for ${flag}`)
    }

    const separator = value.indexOf('=')
    if (separator === -1) {
      throw new Error(`Expected name=value for ${flag}, received: ${value}`)
    }

    const name = value.slice(0, separator).trim()
    const entryValue = value.slice(separator + 1).trim()
    if (!name || !entryValue) {
      throw new Error(`Expected name=value for ${flag}, received: ${value}`)
    }

    if (flag === '--upstream-header') {
      upstreamHeaders[name] = entryValue
    } else {
      upstreamQuery[name] = entryValue
    }

    index += 1
  }

  return {
    destinationWallet,
    originUrl,
    priceUsdc,
    upstreamHeaders,
    upstreamQuery,
    workerUrl,
  }
}

function usage() {
  return [
    'Usage:',
    '  pimpp request <url>',
    '  pimpp register <worker-url> <origin-url> <price-usdc> <destination-wallet> [--upstream-header name=value] [--upstream-query name=value]',
    '  pimpp wallet whoami',
  ].join('\n')
}
