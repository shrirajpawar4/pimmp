import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { USDC_BASE_ADDRESS, USDC_BASE_CHAIN_ID } from '@pimpp/usdc-base'
import { getAddress } from 'viem'

import { resolvePaymentVerification } from '../src/payment.js'
import { createTempoUsdPayment } from '../src/payments/tempo-usd.js'
import { createDefaultUsdcBasePayment } from '../src/payments/usdc-base.js'
import { getPaymentAdapter } from '../src/payments/index.js'
import type { ChallengeState, LegacyChallengeState, PimpEndpoint } from '../src/types.js'

describe('resolvePaymentVerification', () => {
  it('accepts the current usdc-base challenge snapshot', () => {
    const endpoint = createEndpoint()
    const result = resolvePaymentVerification({
      challenge: createChallenge(endpoint),
      endpoint,
      now: 1_000,
      txidSpent: false,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.matchedRoute.path, '/search')
    assert.equal(result.chargeRequest.recipient, endpoint.payment.recipient)
  })

  it('rejects replayed transaction ids before verifier dispatch', () => {
    const result = resolvePaymentVerification({
      challenge: createChallenge(createEndpoint()),
      endpoint: createEndpoint(),
      now: 1_000,
      txidSpent: true,
    })

    assert.deepEqual(result, {
      ok: false,
      error: 'transaction already spent',
    })
  })

  it('rejects a mismatched challenge payment method', () => {
    const endpoint = createEndpoint()
    const challenge = {
      ...createChallenge(endpoint),
      paymentMethod: 'tempo-usd',
    } as unknown as ChallengeState

    const result = resolvePaymentVerification({
      challenge,
      endpoint,
      now: 1_000,
      txidSpent: false,
    })

    assert.deepEqual(result, {
      ok: false,
      error: 'challenge payment method mismatch',
    })
  })

  it('rejects challenges whose stored amount no longer matches the route price', () => {
    const endpoint = createEndpoint({
      routePricesAtomic: {
        '/search': '20000',
      },
    })

    const result = resolvePaymentVerification({
      challenge: createChallenge(createEndpoint()),
      endpoint,
      now: 1_000,
      txidSpent: false,
    })

    assert.deepEqual(result, {
      ok: false,
      error: 'challenge payment details mismatch',
    })
  })

  it('rejects challenges whose stored token details do not match the endpoint method config', () => {
    const endpoint = createEndpoint()
    const challenge = createChallenge(endpoint, {
      chargeRequest: {
        amount: '10000',
        currency: 'usdc',
        recipient: endpoint.payment.recipient,
        description: 'Proxy access for endpoint-1/search',
        methodDetails: {
          chainId: USDC_BASE_CHAIN_ID,
          network: 'base',
          token: getAddress('0x0000000000000000000000000000000000000001'),
        },
      },
    })

    const result = resolvePaymentVerification({
      challenge,
      endpoint,
      now: 1_000,
      txidSpent: false,
    })

    assert.deepEqual(result, {
      ok: false,
      error: 'challenge payment details mismatch',
    })
  })

  it('accepts legacy challenge state for the existing usdc-base flow', () => {
    const endpoint = createEndpoint()
    const legacyChallenge: LegacyChallengeState = {
      endpointId: endpoint.id,
      expectedAmount: '10000',
      expectedRecipient: endpoint.payment.recipient,
      expiresAt: 5_000,
      routePath: '/search',
    }

    const result = resolvePaymentVerification({
      challenge: legacyChallenge,
      endpoint,
      now: 1_000,
      txidSpent: false,
    })

    assert.equal(result.ok, true)
  })

  it('accepts the current tempo-usd challenge snapshot', () => {
    const endpoint = createTempoEndpoint()
    const result = resolvePaymentVerification({
      challenge: createChallenge(endpoint),
      endpoint,
      now: 1_000,
      txidSpent: false,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.chargeRequest.currency, 'usd')
    assert.equal(result.chargeRequest.methodDetails.referenceStrategy, 'challenge-id-keccak256')
  })
})

function createEndpoint(overrides: Partial<PimpEndpoint> = {}): PimpEndpoint {
  const recipient = getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00')
  return {
    callCount: 0,
    createdAt: 1,
    id: 'endpoint-1',
    originUrl: 'https://api.example.com',
    payment: createDefaultUsdcBasePayment(recipient),
    routePricesAtomic: {
      '/search': '10000',
    },
    upstreamHeaders: {},
    upstreamQuery: {},
    ...overrides,
  }
}

function createChallenge(
  endpoint: PimpEndpoint,
  overrides: Partial<ChallengeState> = {},
): ChallengeState {
  const adapter = getPaymentAdapter(endpoint.payment.method)

  return {
    endpointId: endpoint.id,
    expiresAt: 5_000,
    routePath: '/search',
    paymentMethod: endpoint.payment.method,
    chargeRequest: adapter.serializeChargeRequest(
      adapter.buildChargeRequest(endpoint, { path: '/search', priceAtomic: '10000' }),
    ),
    ...overrides,
  }
}

function createTempoEndpoint(overrides: Partial<PimpEndpoint> = {}): PimpEndpoint {
  const recipient = getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00')
  const token = getAddress('0x1111111111111111111111111111111111111111')
  return {
    callCount: 0,
    createdAt: 1,
    id: 'endpoint-1',
    originUrl: 'https://api.example.com',
    payment: createTempoUsdPayment({
      chainId: 42431,
      recipient,
      token,
    }),
    routePricesAtomic: {
      '/search': '10000',
    },
    upstreamHeaders: {},
    upstreamQuery: {},
    ...overrides,
  }
}
