import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getAddress } from 'viem'

import { USDC_BASE_ADDRESS, USDC_BASE_CHAIN_ID } from '@pimpp/usdc-base'

import { buildUpstreamUrl, createChallengeState } from '../src/proxy.js'
import { createDefaultUsdcBasePayment } from '../src/payments/usdc-base.js'
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
        GATEWAY_CACHE: endpoints,
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

    const stored = JSON.parse(writes[0].value)
    assert.deepEqual(stored.payment, {
      method: 'usdc-base',
      recipient: getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
      currency: 'usdc',
      network: 'base',
      chainId: USDC_BASE_CHAIN_ID,
      token: USDC_BASE_ADDRESS,
    })
    assert.equal('destinationWallet' in stored, false)
  })

  it('stores a tempo-usd payment configuration when provided', async () => {
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
        GATEWAY_CACHE: endpoints,
        PIMP_DATA_KEY: btoa('12345678901234567890123456789012'),
        PIMP_DESTINATION_WALLET: getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
        PIMP_SECRET: 'secret',
        TEMPO_CHAIN_ID: '42431',
        TEMPO_RPC_URL: 'https://rpc.moderato.tempo.xyz',
        UPSTASH_REDIS_REST_TOKEN: 'token',
        UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
      } as unknown as Parameters<typeof registerEndpoint>[0],
      'https://pimpp.fun/register',
      {
        baseUrl: 'https://api.example.com/v1',
        payment: {
          method: 'tempo-usd',
          recipient: getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
          token: getAddress('0x1111111111111111111111111111111111111111'),
        },
        routePricesUsdc: {
          '/search': '0.01',
        },
      },
    )

    assert.equal(result.proxiedBaseUrl, `https://pimpp.fun/p/${result.id}`)
    assert.equal(writes.length, 1)

    const stored = JSON.parse(writes[0].value)
    assert.deepEqual(stored.payment, {
      method: 'tempo-usd',
      recipient: getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
      currency: 'usd',
      network: 'tempo',
      chainId: 42431,
      token: getAddress('0x1111111111111111111111111111111111111111'),
    })
  })
})

describe('createChallengeState', () => {
  it('stores payment method metadata and a charge request snapshot', () => {
    const endpoint = {
      id: 'endpoint-1',
      payment: createDefaultUsdcBasePayment(
        getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
      ),
    }

    assert.deepEqual(
      createChallengeState({
        chargeRequest: {
          amount: '10000',
          currency: 'usdc',
          recipient: endpoint.payment.recipient,
          description: 'Proxy access for endpoint-1/search',
          methodDetails: {
            chainId: USDC_BASE_CHAIN_ID,
            network: 'base',
            token: USDC_BASE_ADDRESS,
          },
        },
        endpoint,
        expiresAt: 1_000,
        routePath: '/search',
      }),
      {
        endpointId: 'endpoint-1',
        expiresAt: 1_000,
        routePath: '/search',
        paymentMethod: 'usdc-base',
        chargeRequest: {
          amount: '10000',
          currency: 'usdc',
          recipient: endpoint.payment.recipient,
          description: 'Proxy access for endpoint-1/search',
          methodDetails: {
            chainId: USDC_BASE_CHAIN_ID,
            network: 'base',
            token: USDC_BASE_ADDRESS,
          },
        },
      },
    )
  })
})
