import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getAddress } from 'viem'

import {
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
    assert.deepEqual(
      matchRoutePrice(
        {
          callCount: 0,
          createdAt: Date.now(),
          destinationWallet: getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
          id: 'endpoint-1',
          originUrl: 'https://api.example.com',
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
          destinationWallet: getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
          id: 'endpoint-2',
          originUrl: 'https://api.example.com',
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
          destinationWallet: getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
          id: 'endpoint-3',
          originUrl: 'https://api.example.com',
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
})
