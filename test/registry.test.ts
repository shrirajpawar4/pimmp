import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getAddress } from 'viem'

import { createDefaultUsdcBasePayment } from '../src/payments/usdc-base.js'
import {
  createWalletOwner,
  getEndpoint,
  getEndpointIdLength,
  matchRoutePrice,
  normalizePrice,
  normalizeRoutePath,
  validateDestinationWallet,
  validateOriginUrl,
} from '../src/registry.js'

describe('registry validation', () => {
  it('normalizes decimal USDC prices to atomic units', () => {
    assert.equal(normalizePrice('0.01'), '10000')
    assert.equal(normalizePrice('1'), '1000000')
  })

  it('uses configured price bounds', () => {
    assert.equal(
      normalizePrice('0.0001', {
        PIMP_MIN_PRICE_USDC: '0.000001',
        PIMP_MAX_PRICE_USDC: '0.01',
      }),
      '100',
    )
    assert.throws(
      () =>
        normalizePrice('0.02', {
          PIMP_MIN_PRICE_USDC: '0.000001',
          PIMP_MAX_PRICE_USDC: '0.01',
        }),
      /priceUsdc must be between 0.000001 and 0.01/,
    )
  })

  it('rejects invalid configured price bounds', () => {
    assert.throws(
      () =>
        normalizePrice('0.01', {
          PIMP_MIN_PRICE_USDC: 'abc',
        }),
      /PIMP_MIN_PRICE_USDC must be a decimal USDC amount/,
    )
    assert.throws(
      () =>
        normalizePrice('0.01', {
          PIMP_MIN_PRICE_USDC: '2',
          PIMP_MAX_PRICE_USDC: '1',
        }),
      /PIMP_MIN_PRICE_USDC must be less than or equal to PIMP_MAX_PRICE_USDC/,
    )
  })

  it('uses configured endpoint id length within limits', () => {
    assert.equal(getEndpointIdLength({}), 10)
    assert.equal(getEndpointIdLength({ PIMP_ENDPOINT_ID_LENGTH: '24' }), 24)
    assert.throws(
      () => getEndpointIdLength({ PIMP_ENDPOINT_ID_LENGTH: '5' }),
      /PIMP_ENDPOINT_ID_LENGTH must be between 6 and 64/,
    )
  })

  it('rejects blocked origin hosts', () => {
    assert.throws(() => validateOriginUrl('http://127.0.0.1:3000'))
    assert.throws(() => validateOriginUrl('http://192.168.1.10/api'))
  })

  it('accepts valid origins and checksum-normalizes wallets', () => {
    const url = validateOriginUrl('https://api.example.com/v1')
    assert.equal(url.hostname, 'api.example.com')
    assert.equal(
      validateDestinationWallet('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
      getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
    )
  })

  it('normalizes route paths and rejects query strings', () => {
    assert.equal(normalizeRoutePath('search'), '/search')
    assert.equal(normalizeRoutePath('/search/'), '/search')
    assert.throws(() => normalizeRoutePath('/search?q=demo'))
  })

  it('matches exact route prices and falls back for legacy endpoints', () => {
    const payment = createDefaultUsdcBasePayment(
      getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
    )
    assert.deepEqual(
      matchRoutePrice(
        {
          callCount: 0,
          createdAt: Date.now(),
          id: 'endpoint-1',
          originUrl: 'https://api.example.com',
          owner: createWalletOwner(payment),
          payment,
          routePricesAtomic: {
            '/search': '10000',
            '/summarize': '20000',
          },
          upstreamHeaders: {},
          upstreamQuery: {},
        },
        '/search',
      ),
      { path: '/search', priceAtomic: '10000' },
    )

    assert.equal(
      matchRoutePrice(
        {
          callCount: 0,
          createdAt: Date.now(),
          id: 'endpoint-2',
          originUrl: 'https://api.example.com',
          owner: createWalletOwner(payment),
          payment,
          priceAtomic: '5000',
          upstreamHeaders: {},
          upstreamQuery: {},
        },
        '/anything',
      )?.priceAtomic,
      '5000',
    )

    assert.equal(
      matchRoutePrice(
        {
          callCount: 0,
          createdAt: Date.now(),
          id: 'endpoint-3',
          originUrl: 'https://api.example.com',
          owner: createWalletOwner(payment),
          payment,
          routePricesAtomic: {
            '/search': '10000',
          },
          upstreamHeaders: {},
          upstreamQuery: {},
        },
        '/export',
      ),
      null,
    )
  })

  it('hydrates legacy payment records without stored owner metadata', async () => {
    const recipient = getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00')
    const payment = createDefaultUsdcBasePayment(recipient)
    const endpoints = createKvNamespace({
      'endpoint-1': JSON.stringify({
        callCount: 0,
        createdAt: 1,
        id: 'endpoint-1',
        originUrl: 'https://api.example.com',
        payment,
        routePricesAtomic: {
          '/search': '10000',
        },
      }),
    })

    const endpoint = await getEndpoint(createEnv(endpoints), 'endpoint-1')

    assert.deepEqual(endpoint?.owner, {
      type: 'wallet',
      chainId: payment.chainId,
      address: recipient,
    })
  })
})

function createEnv(endpoints: KVNamespace) {
  return {
    BASE_RPC_URL: 'https://mainnet.base.org',
    ENDPOINTS: endpoints,
    GATEWAY_CACHE: endpoints,
    PIMP_DATA_KEY: btoa('12345678901234567890123456789012'),
    PIMP_DESTINATION_WALLET: getAddress('0x1111111111111111111111111111111111111111'),
    PIMP_SECRET: 'secret',
    UPSTASH_REDIS_REST_TOKEN: 'token',
    UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
  } as Parameters<typeof getEndpoint>[0]
}

function createKvNamespace(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))

  return {
    async get(key: string) {
      return store.get(key) ?? null
    },
    async put(key: string, value: string) {
      store.set(key, value)
    },
  } as unknown as KVNamespace
}
