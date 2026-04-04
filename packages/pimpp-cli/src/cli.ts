#!/usr/bin/env node

import { Mppx } from 'mppx/client'
import { pathToFileURL } from 'node:url'
import { privateKeyToAccount } from 'viem/accounts'

import { usdcBaseClient } from '@pimpp/usdc-base'
import {
  getProxyTemplate,
  getProxyTemplates,
  isProxyTemplateId,
} from '../../../src/templates/index.js'

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
        baseUrl: options.baseUrl,
        routePricesUsdc: options.routePricesUsdc,
        ...(options.authHeader ? { authHeader: options.authHeader } : {}),
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}

export function parseRegisterArgs(args: string[]) {
  if (args.length < 2) {
    throw new Error(
      `Usage: pimpp register <worker-url> <base-url> [--template ${getTemplateUsageList()}] [--price usdc] [--route path=price] [--auth-header name=value]`,
    )
  }

  const [workerUrl, baseUrl, ...rest] = args
  const routePricesUsdc: Record<string, string> = {}
  let authHeader: { name: string; value: string } | undefined
  let template: string | undefined
  let templatePriceUsdc: string | undefined

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index]
    const value = rest[index + 1]
    if (
      flag !== '--auth-header' &&
      flag !== '--price' &&
      flag !== '--route' &&
      flag !== '--template'
    ) {
      throw new Error(`Unknown option: ${flag}`)
    }
    if (!value) {
      throw new Error(`Missing value for ${flag}`)
    }

    if (flag === '--template') {
      if (!isProxyTemplateId(value)) {
        throw new Error(`Unknown template: ${value}`)
      }
      template = value
    } else if (flag === '--price') {
      templatePriceUsdc = value
    } else {
      const separator = value.indexOf('=')
      if (separator === -1) {
        throw new Error(`Expected name=value for ${flag}, received: ${value}`)
      }

      const name = value.slice(0, separator).trim()
      const entryValue = value.slice(separator + 1).trim()
      if (!name || !entryValue) {
        throw new Error(`Expected name=value for ${flag}, received: ${value}`)
      }

      if (flag === '--auth-header') {
        authHeader = { name, value: entryValue }
      } else {
        routePricesUsdc[name] = entryValue
      }
    }

    index += 1
  }

  if (template) {
    const templateDefinition = getProxyTemplate(template)
    if (!templateDefinition) {
      throw new Error(`Unknown template: ${template}`)
    }
    const templateRoutes = templateDefinition.routes
    if (!templatePriceUsdc && templateRoutes.some((path) => routePricesUsdc[path] === undefined)) {
      throw new Error(`Template ${template} requires --price or explicit --route values for every route`)
    }
    for (const path of templateRoutes) {
      routePricesUsdc[path] ??= templatePriceUsdc!
    }
  }

  if (Object.keys(routePricesUsdc).length === 0) {
    throw new Error('At least one --route or a --template with --price is required')
  }

  return {
    authHeader,
    baseUrl,
    routePricesUsdc,
    workerUrl,
  }
}

function usage() {
  return [
    'Usage:',
    '  pimpp request <url>',
    `  pimpp register <worker-url> <base-url> [--template ${getTemplateUsageList()}] [--price usdc] [--route path=price] [--auth-header name=value]`,
    '  pimpp wallet whoami',
  ].join('\n')
}

function getTemplateUsageList() {
  return getProxyTemplates()
    .map((template) => template.id)
    .join('|')
}
