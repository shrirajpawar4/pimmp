import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { getAddress } from 'viem'

import app from '../src/index.js'
import {
  buildGatewayUpstreamUrl,
  formatLlmsDirectory,
  getGatewayServices,
  handleGateway,
} from '../src/gateway.js'
import type { Bindings, MppService } from '../src/types.js'

type KvPutOptions = {
  expirationTtl?: number
}

const SAMPLE_SERVICES: MppService[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    serviceUrl: 'https://api.mpp.dev/openai/v1',
    description: 'Model inference.',
    categories: ['ai'],
  },
  {
    id: 'exa',
    name: 'Exa',
    serviceUrl: 'https://search.mpp.dev',
    description: 'Web search.',
    categories: ['search'],
  },
]

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('gateway registry cache', () => {
  it('fetches the registry on cache miss and writes KV with TTL', async () => {
    const cache = createKvNamespace()
    globalThis.fetch = async (input) => {
      assert.equal(String(input), 'https://mpp.dev/api/services')
      return jsonResponse({ services: SAMPLE_SERVICES })
    }

    const services = await getGatewayServices(createEnv({ GATEWAY_CACHE: cache }))

    assert.deepEqual(services, SAMPLE_SERVICES)
    assert.deepEqual(cache.puts, [
      {
        key: 'gateway:services:v1',
        value: JSON.stringify(SAMPLE_SERVICES),
        options: { expirationTtl: 3600 },
      },
    ])
  })

  it('uses configured registry URL and cache TTL', async () => {
    const cache = createKvNamespace()
    globalThis.fetch = async (input) => {
      assert.equal(String(input), 'https://registry.example.com/services')
      return jsonResponse({ services: SAMPLE_SERVICES })
    }

    const services = await getGatewayServices(
      createEnv({
        GATEWAY_CACHE: cache,
        GATEWAY_CACHE_TTL_SECONDS: '27',
        MPP_REGISTRY_URL: 'https://registry.example.com/services',
      }),
    )

    assert.deepEqual(services, SAMPLE_SERVICES)
    assert.deepEqual(cache.puts, [
      {
        key: 'gateway:services:v1',
        value: JSON.stringify(SAMPLE_SERVICES),
        options: { expirationTtl: 27 },
      },
    ])
  })

  it('uses a configured cache key', async () => {
    const cache = createKvNamespace()
    globalThis.fetch = async () => jsonResponse({ services: SAMPLE_SERVICES })

    await getGatewayServices(
      createEnv({
        GATEWAY_CACHE: cache,
        GATEWAY_CACHE_KEY: 'gateway:services:test',
      }),
    )

    assert.equal(cache.puts[0].key, 'gateway:services:test')
  })

  it('throws predictable errors for invalid registry and cache config', async () => {
    await assert.rejects(
      getGatewayServices(
        createEnv({
          GATEWAY_CACHE: createKvNamespace(),
          MPP_REGISTRY_URL: 'not a url',
        }),
      ),
      /MPP_REGISTRY_URL must be a valid URL/,
    )

    globalThis.fetch = async () => jsonResponse({ services: SAMPLE_SERVICES })
    await assert.rejects(
      getGatewayServices(
        createEnv({
          GATEWAY_CACHE: createKvNamespace(),
          GATEWAY_CACHE_TTL_SECONDS: '0',
        }),
      ),
      /GATEWAY_CACHE_TTL_SECONDS must be a positive integer/,
    )
  })

  it('serves the registry from KV on cache hit', async () => {
    const cache = createKvNamespace({
      'gateway:services:v1': JSON.stringify(SAMPLE_SERVICES),
    })
    let called = false
    globalThis.fetch = async () => {
      called = true
      throw new Error('unexpected fetch')
    }

    const services = await getGatewayServices(createEnv({ GATEWAY_CACHE: cache }))

    assert.deepEqual(services, SAMPLE_SERVICES)
    assert.equal(called, false)
  })
})

describe('gateway formatting', () => {
  it('formats llms.txt with gateway URLs', () => {
    assert.equal(
      formatLlmsDirectory(SAMPLE_SERVICES, 'https://pimpp.dev'),
      [
        'name: OpenAI',
        'serviceUrl: https://pimpp.dev/g/openai',
        'description: Model inference.',
        '',
        'name: Exa',
        'serviceUrl: https://pimpp.dev/g/exa',
        'description: Web search.',
      ].join('\n'),
    )
  })

  it('joins service base paths with suffixes and preserves query params', () => {
    const upstream = buildGatewayUpstreamUrl(
      'https://api.mpp.dev/openai/v1?fixed=yes',
      '/chat/completions',
      new URLSearchParams('model=gpt-4.1'),
    )

    assert.equal(
      upstream,
      'https://api.mpp.dev/openai/v1/chat/completions?fixed=yes&model=gpt-4.1',
    )
  })
})

describe('handleGateway', () => {
  it('returns the cached service list as JSON', async () => {
    const response = await handleGateway(
      new Request('https://pimpp.dev/gateway/services'),
      createEnv({
        GATEWAY_CACHE: createKvNamespace({
          'gateway:services:v1': JSON.stringify(SAMPLE_SERVICES),
        }),
      }),
    )

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/json')
    assert.deepEqual(await response.json(), SAMPLE_SERVICES)
  })

  it('returns llms.txt as plaintext', async () => {
    const response = await handleGateway(
      new Request('https://pimpp.dev/gateway/services/llms.txt'),
      createEnv({
        GATEWAY_CACHE: createKvNamespace({
          'gateway:services:v1': JSON.stringify(SAMPLE_SERVICES),
        }),
      }),
    )

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8')
    assert.match(await response.text(), /serviceUrl: https:\/\/pimpp.dev\/g\/openai/)
  })

  it('returns 404 JSON when a service id is missing', async () => {
    const response = await handleGateway(
      new Request('https://pimpp.dev/g/missing/chat'),
      createEnv({
        GATEWAY_CACHE: createKvNamespace({
          'gateway:services:v1': JSON.stringify(SAMPLE_SERVICES),
        }),
      }),
    )

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'service not found' })
  })

  it('proxies requests through to the matched service and preserves query strings', async () => {
    globalThis.fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(String(input), init)
      assert.equal(request.url, 'https://api.mpp.dev/openai/v1/chat/completions?fixed=yes&stream=true')
      assert.equal(request.method, 'POST')
      assert.equal(request.headers.get('x-proof'), 'proof-123')
      assert.equal(await request.text(), 'hello')
      return new Response('upstream-ok', { status: 200 })
    }

    const response = await handleGateway(
      new Request('https://pimpp.dev/g/openai/chat/completions?stream=true', {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'x-proof': 'proof-123',
        },
        body: 'hello',
      }),
      createEnv({
        GATEWAY_CACHE: createKvNamespace({
          'gateway:services:v1': JSON.stringify([
            {
              ...SAMPLE_SERVICES[0],
              serviceUrl: 'https://api.mpp.dev/openai/v1?fixed=yes',
            },
          ]),
        }),
      }),
    )

    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'upstream-ok')
  })

  it('passes upstream 402 responses through unchanged', async () => {
    globalThis.fetch = async () =>
      new Response('payment required', {
        status: 402,
        headers: {
          'content-type': 'text/plain',
          'x-payment-challenge': 'challenge-1',
        },
      })

    const response = await handleGateway(
      new Request('https://pimpp.dev/g/openai/chat/completions'),
      createEnv({
        GATEWAY_CACHE: createKvNamespace({
          'gateway:services:v1': JSON.stringify(SAMPLE_SERVICES),
        }),
      }),
    )

    assert.equal(response.status, 402)
    assert.equal(response.headers.get('x-payment-challenge'), 'challenge-1')
    assert.equal(await response.text(), 'payment required')
  })

  it('returns 502 JSON when the registry is unavailable', async () => {
    globalThis.fetch = async () => new Response('upstream failed', { status: 503 })

    const response = await handleGateway(
      new Request('https://pimpp.dev/gateway/services'),
      createEnv({ GATEWAY_CACHE: createKvNamespace() }),
    )

    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), { error: 'service registry unavailable' })
  })
})

describe('index routing', () => {
  it('returns configured service metadata from the root route', async () => {
    const response = await app.request(
      'https://pimpp.dev/',
      {},
      createEnv({
        PIMP_SERVICE_DESCRIPTION: 'Configured proxy description.',
        PIMP_SERVICE_NAME: 'configured-pimpp',
      }),
    )

    assert.equal(response.status, 200)
    const body = (await response.json()) as { description: string; name: string }
    assert.equal(body.name, 'configured-pimpp')
    assert.equal(body.description, 'Configured proxy description.')
  })

  it('dispatches gateway paths without affecting the existing /p flow', async () => {
    const env = createEnv({
      ENDPOINTS: createKvNamespace(),
      GATEWAY_CACHE: createKvNamespace({
        'gateway:services:v1': JSON.stringify(SAMPLE_SERVICES),
      }),
    })

    const gatewayResponse = await app.request('https://pimpp.dev/gateway/services', {}, env)
    const proxyResponse = await app.request('https://pimpp.dev/p/missing/chat', {}, env)

    assert.equal(gatewayResponse.status, 200)
    assert.equal(proxyResponse.status, 404)
    assert.deepEqual(await proxyResponse.json(), { error: 'not found' })
  })

  it('returns payment metadata from the endpoint status route', async () => {
    const env = createEnv({
      TEMPO_CHAIN_ID: '42431',
      TEMPO_RPC_URL: 'https://rpc.moderato.tempo.xyz',
    })

    const registerResponse = await app.request(
      'https://pimpp.dev/register',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          baseUrl: 'https://api.example.com/v1',
          payment: {
            method: 'tempo-usd',
            recipient: getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
            token: getAddress('0x1111111111111111111111111111111111111111'),
          },
          routePricesUsdc: {
            '/search': '0.01',
          },
        }),
      },
      env,
    )

    assert.equal(registerResponse.status, 200)
    const registered = (await registerResponse.json()) as { id: string }
    const statusResponse = await app.request(`https://pimpp.dev/p/${registered.id}/status`, {}, env)

    assert.equal(statusResponse.status, 200)
    const statusBody = (await statusResponse.json()) as {
      callCount: number
      createdAt: number
      originHost: string
      payment: {
        chainId: number
        currency: string
        method: string
        network: string
        recipient: string
        token: string
      }
      routePricesAtomic: Record<string, string>
    }
    assert.equal(typeof statusBody.createdAt, 'number')
    assert.deepEqual({ ...statusBody, createdAt: 0 }, {
      callCount: 0,
      createdAt: 0,
      originHost: 'api.example.com',
      payment: {
        chainId: 42431,
        currency: 'usd',
        method: 'tempo-usd',
        network: 'tempo',
        recipient: getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
        token: getAddress('0x1111111111111111111111111111111111111111'),
      },
      routePricesAtomic: {
        '/search': '10000',
      },
    })
  })

  it('returns configured register instructions', async () => {
    const env = createEnv({
      PIMP_REGISTER_INSTRUCTIONS: 'Configured payment instructions.',
    })

    const response = await app.request(
      'https://pimpp.dev/register',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          baseUrl: 'https://api.example.com/v1',
          routePricesUsdc: {
            '/search': '0.01',
          },
        }),
      },
      env,
    )

    assert.equal(response.status, 200)
    const body = (await response.json()) as { instructions: string }
    assert.equal(body.instructions, 'Configured payment instructions.')
  })
})

function createEnv(overrides: Partial<Bindings>): Bindings {
  return {
    BASE_RPC_URL: 'https://mainnet.base.org',
    ENDPOINTS: createKvNamespace(),
    GATEWAY_CACHE: createKvNamespace(),
    PIMP_DATA_KEY: btoa('12345678901234567890123456789012'),
    PIMP_DESTINATION_WALLET: getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
    PIMP_SECRET: 'secret',
    TEMPO_CHAIN_ID: '42431',
    TEMPO_RPC_URL: 'https://rpc.moderato.tempo.xyz',
    UPSTASH_REDIS_REST_TOKEN: 'token',
    UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
    ...overrides,
  } as Bindings
}

function createKvNamespace(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  const puts: Array<{ key: string; value: string; options?: KvPutOptions }> = []

  return {
    puts,
    async get(key: string) {
      return store.get(key) ?? null
    },
    async put(key: string, value: string, options?: KvPutOptions) {
      store.set(key, value)
      puts.push({ key, value, options })
    },
  } as KVNamespace & {
    puts: Array<{ key: string; value: string; options?: KvPutOptions }>
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  })
}
