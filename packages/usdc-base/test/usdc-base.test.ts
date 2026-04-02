import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Challenge, Credential, Receipt } from 'mppx'

import {
  receiptMatchesTransfer,
  USDC_BASE_ADDRESS,
  usdcBase,
  usdcBaseClient,
  usdcBaseMethod,
  usdcBaseRequestSchema,
} from '../src/index.js'

describe('usdc-base schemas', () => {
  it('parses the request shape', () => {
    const request = usdcBaseRequestSchema.parse({
      amount: '1000000',
      currency: 'usdc',
      recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
      methodDetails: {
        chainId: 8453,
        network: 'base',
        token: USDC_BASE_ADDRESS,
      },
    })
    assert.equal(request.currency, 'usdc')
    assert.equal(request.methodDetails.network, 'base')
  })
})

describe('usdcBase server', () => {
  it('verifies a transaction via injected verifier', async () => {
    const method = usdcBase({
      verifyTransfer: async ({ challengeId, request, txid }) => {
        assert.equal(challengeId, 'challenge-1')
        assert.equal(request.amount, '1000000')
        assert.equal(txid, '0xtx')
        return { txid, valid: true }
      },
    })

    const challenge = Challenge.fromMethod(usdcBaseMethod, {
      id: 'challenge-1',
      realm: 'pimpp.fun',
      request: {
        amount: '1000000',
        currency: 'usdc',
        recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
        methodDetails: {
          chainId: 8453,
          network: 'base',
          token: USDC_BASE_ADDRESS,
        },
      },
    })

    const credential = Credential.from({
      challenge,
      payload: {
        txid: '0xtx',
      },
    })

    const receipt = await method.verify({
      credential: credential as Parameters<typeof method.verify>[0]['credential'],
      request: challenge.request,
    })

    assert.deepEqual(
      { ...receipt, timestamp: 'redacted' },
      { ...Receipt.from({ method: 'usdc-base', reference: '0xtx', status: 'success', timestamp: receipt.timestamp }), timestamp: 'redacted' },
    )
  })
})

describe('usdcBase client', () => {
  it('serializes a credential after creating payment', async () => {
    const client = usdcBaseClient({
      createPayment: async ({ challengeId, request }) => {
        assert.equal(challengeId, 'challenge-2')
        assert.equal(request.amount, '250000')
        return { source: 'did:pkh:eip155:8453:0x1234', txid: '0xpaid' }
      },
    })

    const challenge = Challenge.fromMethod(usdcBaseMethod, {
      id: 'challenge-2',
      realm: 'pimpp.fun',
      request: {
        amount: '250000',
        currency: 'usdc',
        recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
        methodDetails: {
          chainId: 8453,
          network: 'base',
          token: USDC_BASE_ADDRESS,
        },
      },
    })

    const serialized = await client.createCredential({
      challenge: challenge as Parameters<typeof client.createCredential>[0]['challenge'],
    })
    const parsed = Credential.deserialize<{ txid: string }>(serialized)
    assert.equal(parsed.payload.txid, '0xpaid')
    assert.equal(parsed.source, 'did:pkh:eip155:8453:0x1234')
  })
})

describe('receiptMatchesTransfer', () => {
  it('finds a matching transfer log', () => {
    const transferTopic =
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    const fromTopic = `0x${'0'.repeat(24)}1111111111111111111111111111111111111111`
    const toTopic = `0x${'0'.repeat(24)}742d35cc6634c0532925a3b844bc9e7595f8fe00`
    const valueHex = `0x${(1000000n).toString(16).padStart(64, '0')}` as `0x${string}`

    const matched = receiptMatchesTransfer({
      expectedAmount: '1000000',
      expectedRecipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
      logs: [
        {
          address: USDC_BASE_ADDRESS,
          data: valueHex,
          topics: [transferTopic, fromTopic as `0x${string}`, toTopic as `0x${string}`],
        },
      ],
    })

    assert.equal(matched.matches, true)
    assert.equal(matched.observedAmount, '1000000')
  })
})
