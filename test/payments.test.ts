import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { USDC_BASE_ADDRESS, USDC_BASE_CHAIN_ID } from '@pimpp/usdc-base'
import { getAddress } from 'viem'

import { getPaymentAdapter } from '../src/payments/index.js'
import { createTempoUsdPayment } from '../src/payments/tempo-usd.js'
import { createDefaultUsdcBasePayment } from '../src/payments/usdc-base.js'

describe('payment adapters', () => {
  it('builds the current usdc-base request shape', () => {
    const recipient = getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00')
    const endpoint = {
      callCount: 0,
      createdAt: Date.now(),
      id: 'endpoint-1',
      originUrl: 'https://api.example.com',
      payment: createDefaultUsdcBasePayment(recipient),
      routePricesAtomic: {
        '/search': '10000',
      },
      upstreamHeaders: {},
      upstreamQuery: {},
    }

    const adapter = getPaymentAdapter(endpoint.payment.method)
    assert.deepEqual(
      adapter.buildChargeRequest(endpoint, { path: '/search', priceAtomic: '10000' }),
      {
        amount: '10000',
        currency: 'usdc',
        recipient,
        description: 'Proxy access for endpoint-1/search',
        methodDetails: {
          chainId: USDC_BASE_CHAIN_ID,
          network: 'base',
          token: USDC_BASE_ADDRESS,
        },
      },
    )
  })

  it('builds a tempo-usd request with a derived challenge reference strategy', () => {
    const recipient = getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00')
    const token = getAddress('0x1111111111111111111111111111111111111111')
    const endpoint = {
      callCount: 0,
      createdAt: Date.now(),
      id: 'endpoint-2',
      originUrl: 'https://api.example.com',
      payment: createTempoUsdPayment({
        chainId: 42431,
        recipient,
        token,
      }),
      routePricesAtomic: {
        '/search': '25000',
      },
      upstreamHeaders: {},
      upstreamQuery: {},
    }

    const adapter = getPaymentAdapter(endpoint.payment.method)
    assert.deepEqual(
      adapter.buildChargeRequest(endpoint, { path: '/search', priceAtomic: '25000' }),
      {
        amount: '25000',
        currency: 'usd',
        recipient,
        description: 'Proxy access for endpoint-2/search',
        methodDetails: {
          chainId: 42431,
          network: 'tempo',
          referenceStrategy: 'challenge-id-keccak256',
          token,
        },
      },
    )
  })
})
