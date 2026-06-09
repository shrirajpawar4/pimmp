import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import { USDC_BASE_ADDRESS, USDC_BASE_CHAIN_ID } from '@pimpp/usdc-base'
import { getAddress } from 'viem'

import { resolvePaymentVerification, validateAndConsumePayment } from '../src/payment.js'
import { createTempoUsdPayment } from '../src/payments/tempo-usd.js'
import { createDefaultUsdcBasePayment } from '../src/payments/usdc-base.js'
import { getPaymentAdapter, usdcBaseAdapter } from '../src/payments/index.js'
import { createWalletOwner } from '../src/registry.js'
import { claimTxid, DEFAULT_SPENT_TTL_SECONDS, storeChallenge } from '../src/replay.js'
import type { Bindings, ChallengeState, LegacyChallengeState, PimpEndpoint } from '../src/types.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  mock.restoreAll()
  globalThis.fetch = originalFetch
})

describe('resolvePaymentVerification', () => {
  it('accepts the current usdc-base challenge snapshot', () => {
    const endpoint = createEndpoint()
    const result = resolvePaymentVerification({
      challenge: createChallenge(endpoint),
      endpoint,
      now: 1_000,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.matchedRoute.path, '/search')
    assert.equal(result.chargeRequest.recipient, endpoint.payment.recipient)
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
    })

    assert.equal(result.ok, true)
  })

  it('accepts the current tempo-usd challenge snapshot', () => {
    const endpoint = createTempoEndpoint()
    const result = resolvePaymentVerification({
      challenge: createChallenge(endpoint),
      endpoint,
      now: 1_000,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.chargeRequest.currency, 'usd')
    assert.equal(result.chargeRequest.methodDetails.referenceStrategy, 'challenge-id-keccak256')
  })
})

describe('validateAndConsumePayment', () => {
  it('returns already spent before verifier dispatch on fast-fail replay', async () => {
    const verifyTransfer = mock.method(usdcBaseAdapter, 'verifyTransfer', async () => ({
      valid: true,
    }))
    const redis = mockRedis([{ result: '1' }])

    const result = await validateAndConsumePayment({
      challengeId: 'challenge-1',
      endpoint: createEndpoint(),
      env: createEnv(),
      txid: 'tx-1',
    })

    assert.deepEqual(result, { valid: false, error: 'transaction already spent' })
    assert.equal(verifyTransfer.mock.callCount(), 0)
    assert.deepEqual(redis.commands, [[['get', 'spent:tx-1']]])
  })

  it('returns valid after transfer verification and successful atomic claim', async () => {
    const endpoint = createEndpoint()
    const verifyTransfer = mock.method(usdcBaseAdapter, 'verifyTransfer', async () => ({
      valid: true,
    }))
    const redis = mockRedis([
      { result: null },
      { result: JSON.stringify(createFreshChallenge(endpoint)) },
      { result: 'OK' },
    ])

    const result = await validateAndConsumePayment({
      challengeId: 'challenge-1',
      endpoint,
      env: createEnv(),
      txid: 'tx-1',
    })

    assert.deepEqual(result, { valid: true })
    assert.equal(verifyTransfer.mock.callCount(), 1)
    assert.deepEqual(redis.commands.at(-1), [
      ['set', 'spent:tx-1', '1', 'nx', 'ex', DEFAULT_SPENT_TTL_SECONDS],
    ])
  })

  it('returns already spent when the atomic claim loses after valid verification', async () => {
    const endpoint = createEndpoint()
    const verifyTransfer = mock.method(usdcBaseAdapter, 'verifyTransfer', async () => ({
      valid: true,
    }))
    const redis = mockRedis([
      { result: null },
      { result: JSON.stringify(createFreshChallenge(endpoint)) },
      { result: null },
    ])

    const result = await validateAndConsumePayment({
      challengeId: 'challenge-1',
      endpoint,
      env: createEnv(),
      txid: 'tx-1',
    })

    assert.deepEqual(result, { valid: false, error: 'transaction already spent' })
    assert.equal(verifyTransfer.mock.callCount(), 1)
    assert.deepEqual(redis.commands.at(-1), [
      ['set', 'spent:tx-1', '1', 'nx', 'ex', DEFAULT_SPENT_TTL_SECONDS],
    ])
  })

  it('does not claim the txid when transfer verification fails', async () => {
    const endpoint = createEndpoint()
    mock.method(usdcBaseAdapter, 'verifyTransfer', async () => ({
      valid: false,
    }))
    const redis = mockRedis([
      { result: null },
      { result: JSON.stringify(createFreshChallenge(endpoint)) },
    ])

    const result = await validateAndConsumePayment({
      challengeId: 'challenge-1',
      endpoint,
      env: createEnv(),
      txid: 'tx-1',
    })

    assert.deepEqual(result, {
      valid: false,
      error: 'payment transfer did not match challenge',
    })
    assert.deepEqual(redis.commands, [
      [['get', 'spent:tx-1']],
      [['get', 'challenge:challenge-1']],
    ])
  })
})

describe('claimTxid', () => {
  it('uses Redis SET NX with the spent TTL and maps OK/null to booleans', async () => {
    const redis = mockRedis([{ result: 'OK' }, { result: null }])

    assert.equal(await claimTxid(createEnv(), 'tx-1'), true)
    assert.equal(await claimTxid(createEnv(), 'tx-2'), false)
    assert.deepEqual(redis.commands, [
      [['set', 'spent:tx-1', '1', 'nx', 'ex', DEFAULT_SPENT_TTL_SECONDS]],
      [['set', 'spent:tx-2', '1', 'nx', 'ex', DEFAULT_SPENT_TTL_SECONDS]],
    ])
  })

  it('uses the configured spent TTL for Redis claims', async () => {
    const redis = mockRedis([{ result: 'OK' }])

    assert.equal(await claimTxid(createEnv({ PIMP_SPENT_TTL_SECONDS: '42' }), 'tx-1'), true)
    assert.deepEqual(redis.commands, [[['set', 'spent:tx-1', '1', 'nx', 'ex', 42]]])
  })
})

describe('storeChallenge', () => {
  it('uses the configured challenge TTL for Redis challenge writes', async () => {
    const endpoint = createEndpoint()
    const redis = mockRedis([{ result: 'OK' }])

    await storeChallenge(
      createEnv({ PIMP_CHALLENGE_TTL_SECONDS: '123' }),
      'challenge-1',
      createChallenge(endpoint),
    )

    assert.equal(redis.commands.length, 1)
    assert.equal(redis.commands[0][0][0], 'set')
    assert.equal(redis.commands[0][0][1], 'challenge:challenge-1')
    assert.deepEqual(redis.commands[0][0].slice(-2), ['ex', 123])
  })
})

function createEndpoint(overrides: Partial<PimpEndpoint> = {}): PimpEndpoint {
  const recipient = getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00')
  const payment = createDefaultUsdcBasePayment(recipient)
  return {
    callCount: 0,
    createdAt: 1,
    id: 'endpoint-1',
    originUrl: 'https://api.example.com',
    owner: createWalletOwner(payment),
    payment,
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

function createFreshChallenge(endpoint: PimpEndpoint) {
  return createChallenge(endpoint, {
    expiresAt: Date.now() + 60_000,
  })
}

function createTempoEndpoint(overrides: Partial<PimpEndpoint> = {}): PimpEndpoint {
  const recipient = getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00')
  const token = getAddress('0x1111111111111111111111111111111111111111')
  const payment = createTempoUsdPayment({
    chainId: 42431,
    recipient,
    token,
  })
  return {
    callCount: 0,
    createdAt: 1,
    id: 'endpoint-1',
    originUrl: 'https://api.example.com',
    owner: createWalletOwner(payment),
    payment,
    routePricesAtomic: {
      '/search': '10000',
    },
    upstreamHeaders: {},
    upstreamQuery: {},
    ...overrides,
  }
}

function createEnv(overrides: Partial<Bindings> = {}): Bindings {
  return {
    BASE_RPC_URL: 'https://base.example.com',
    ENDPOINTS: {} as KVNamespace,
    GATEWAY_CACHE: {} as KVNamespace,
    PIMP_DATA_KEY: 'data-key',
    PIMP_DESTINATION_WALLET: getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
    PIMP_SECRET: 'secret',
    UPSTASH_REDIS_REST_TOKEN: 'token',
    UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
    ...overrides,
  }
}

function mockRedis(results: Array<{ result: unknown }>) {
  const commands: unknown[][][] = []

  globalThis.fetch = async (_input, init) => {
    assert.ok(init)
    const body = String(init.body)
    commands.push(JSON.parse(body) as unknown[][])
    const result = results.shift()
    assert.ok(result, `unexpected Redis call: ${body}`)
    return new Response(JSON.stringify([result]), {
      headers: {
        'content-type': 'application/json',
      },
    })
  }

  return { commands }
}
