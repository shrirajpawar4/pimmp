import { Mppx } from 'mppx/client'

import { usdcBaseClient } from '@pimpp/usdc-base'

function getEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function createPaidFetch() {
  const mppx = Mppx.create({
    methods: [
      usdcBaseClient({
        privateKey: getEnv('PIMP_PRIVATE_KEY') as `0x${string}`,
        rpcUrl: getEnv('BASE_RPC_URL'),
      }),
    ],
    polyfill: false,
  })

  return async function paidFetch(target: string) {
    const response = await mppx.fetch(target)
    return response.text()
  }
}

async function callWeatherTool(baseUrl: string, prompt: string) {
  const city = extractCity(prompt)
  const target = new URL(baseUrl)
  target.searchParams.set('city', city)

  const paidFetch = createPaidFetch()
  const raw = await paidFetch(target.toString())
  const parsed = JSON.parse(raw) as {
    city?: string
    condition?: string
    temperatureC?: number
  }

  return [
    `Prompt: ${prompt}`,
    `Tool call: GET ${target.toString()}`,
    `Answer: ${parsed.city ?? city} is ${parsed.condition ?? 'unknown'} at ${parsed.temperatureC ?? '?'}C.`,
  ].join('\n')
}

function extractCity(prompt: string) {
  const match = prompt.match(/\bin\s+([A-Za-z][A-Za-z\s-]*)$/i)
  if (match?.[1]) {
    return match[1].trim()
  }
  return 'London'
}

async function main() {
  const [, , baseUrl, ...promptParts] = process.argv
  const prompt = promptParts.join(' ').trim()

  if (!baseUrl || !prompt) {
    throw new Error(
      'Usage: tsx examples/agent-tool-demo.ts <paid-endpoint-url> <natural-language-prompt>',
    )
  }

  process.stdout.write(`${await callWeatherTool(baseUrl, prompt)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
