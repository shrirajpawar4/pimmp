import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getAddress } from 'viem'

import { buildUpstreamUrl } from '../src/proxy.js'
import { registerEndpoint } from '../src/registry.js'

describe('buildUpstreamUrl', () => {
  it('joins base paths and merges query params', () => {
    const url = buildUpstreamUrl(
      'https://api.example.com/data/v1?fixed=yes',
      '/weather',
      new URLSearchParams('q=London'),
      { api_key: 'secret' },
    )

    assert.equal(
      url,
      'https://api.example.com/data/v1/weather?fixed=yes&api_key=secret&q=London',
    )
  })

  it('preserves root-style origins cleanly', () => {
    const url = buildUpstreamUrl(
      'https://api.example.com',
      '/status',
      new URLSearchParams(),
      {},
    )

    assert.equal(url, 'https://api.example.com/status')
  })
})

describe('registerEndpoint', () => {
  it('returns concrete proxied URLs for route-priced endpoints', async () => {
    const writes: Array<{ key: string; value: string }> = []
    const endpoints = {
      async get() {
        return null
      },
      async put(key: string, value: string) {
        writes.push({ key, value })
      },
    } as unknown as KVNamespace
    const result = await registerEndpoint(
      {
        BASE_RPC_URL: 'https://mainnet.base.org',
        ENDPOINTS: endpoints,
        PIMP_DATA_KEY: btoa('12345678901234567890123456789012'),
        PIMP_DESTINATION_WALLET: getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
        PIMP_SECRET: 'secret',
        UPSTASH_REDIS_REST_TOKEN: 'token',
        UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
      } as unknown as Parameters<typeof registerEndpoint>[0],
      'https://pimpp.fun/register',
      {
        authHeader: {
          name: 'authorization',
          value: 'Bearer secret',
        },
        baseUrl: 'https://api.example.com/v1',
        routePricesUsdc: {
          '/search': '0.01',
          '/summarize': '0.02',
        },
      },
    )

    assert.equal(result.proxiedBaseUrl, `https://pimpp.fun/p/${result.id}`)
    assert.deepEqual(result.proxiedRoutes, {
      '/search': `https://pimpp.fun/p/${result.id}/search`,
      '/summarize': `https://pimpp.fun/p/${result.id}/summarize`,
    })
    assert.equal(writes.length, 1)
  })
})
