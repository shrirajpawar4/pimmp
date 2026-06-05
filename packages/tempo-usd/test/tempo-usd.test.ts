import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Challenge, Credential, Receipt } from 'mppx'
import { encodeAbiParameters, encodeEventTopics, getAddress } from 'viem'

import {
  deriveChallengeReference,
  receiptMatchesTransferWithReference,
  tempoTip20TransferAbi,
  tempoUsd,
  tempoUsdClient,
  tempoUsdMethod,
  tempoUsdRequestSchema,
} from '../src/index.js'

const TOKEN = getAddress('0x1111111111111111111111111111111111111111')
const RECIPIENT = getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00')
const FROM = getAddress('0x2222222222222222222222222222222222222222')

describe('tempo-usd schemas', () => {
  it('parses the request shape', () => {
    const request = tempoUsdRequestSchema.parse({
      amount: '1000000',
      currency: 'usd',
      recipient: RECIPIENT,
      methodDetails: {
        chainId: 42431,
        network: 'tempo',
        referenceStrategy: 'challenge-id-keccak256',
        token: TOKEN,
      },
    })

    assert.equal(request.currency, 'usd')
    assert.equal(request.methodDetails.network, 'tempo')
  })
})

describe('tempoUsd server', () => {
  it('verifies a transaction via an injected verifier', async () => {
    const method = tempoUsd({
      verifyTransfer: async ({ challengeId, request, txid }) => {
        assert.equal(challengeId, 'challenge-1')
        assert.equal(request.amount, '1000000')
        assert.equal(txid, '0xtx')
        return { txid, valid: true }
      },
    })

    const challenge = Challenge.fromMethod(tempoUsdMethod, {
      id: 'challenge-1',
      realm: 'pimpp.fun',
      request: {
        amount: '1000000',
        currency: 'usd',
        recipient: RECIPIENT,
        methodDetails: {
          chainId: 42431,
          network: 'tempo',
          referenceStrategy: 'challenge-id-keccak256',
          token: TOKEN,
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
      {
        ...Receipt.from({
          method: 'tempo-usd',
          reference: '0xtx',
          status: 'success',
          timestamp: receipt.timestamp,
        }),
        timestamp: 'redacted',
      },
    )
  })
})

describe('tempoUsd client', () => {
  it('serializes a credential after creating a payment', async () => {
    const client = tempoUsdClient({
      createPayment: async ({ challengeId, request }) => {
        assert.equal(challengeId, 'challenge-2')
        assert.equal(request.amount, '250000')
        return { source: 'did:pkh:eip155:42431:0x1234', txid: '0xpaid' }
      },
    })

    const challenge = Challenge.fromMethod(tempoUsdMethod, {
      id: 'challenge-2',
      realm: 'pimpp.fun',
      request: {
        amount: '250000',
        currency: 'usd',
        recipient: RECIPIENT,
        methodDetails: {
          chainId: 42431,
          network: 'tempo',
          referenceStrategy: 'challenge-id-keccak256',
          token: TOKEN,
        },
      },
    })

    const serialized = await client.createCredential({
      challenge: challenge as Parameters<typeof client.createCredential>[0]['challenge'],
    })
    const parsed = Credential.deserialize<{ txid: string }>(serialized)
    assert.equal(parsed.payload.txid, '0xpaid')
    assert.equal(parsed.source, 'did:pkh:eip155:42431:0x1234')
  })
})

describe('receiptMatchesTransferWithReference', () => {
  it('matches a TransferWithMemo log carrying the derived challenge reference', () => {
    const memo = deriveChallengeReference('challenge-3')
    const matched = receiptMatchesTransferWithReference({
      expectedAmount: '1000000',
      expectedMemo: memo,
      expectedRecipient: RECIPIENT,
      expectedToken: TOKEN,
      logs: [
        {
          address: TOKEN,
          data: encodeAbiParameters([{ name: 'amount', type: 'uint256' }], [1000000n]),
          topics: encodeEventTopics({
            abi: tempoTip20TransferAbi,
            eventName: 'TransferWithMemo',
            args: {
              from: FROM,
              memo,
              to: RECIPIENT,
            },
          }) as readonly `0x${string}`[],
        },
      ],
    })

    assert.equal(matched.matches, true)
    assert.equal(matched.observedAmount, '1000000')
    assert.equal(matched.observedMemo, memo)
    assert.equal(matched.recipient, RECIPIENT)
  })

  it('flags plain transfers as missing the required challenge reference', () => {
    const matched = receiptMatchesTransferWithReference({
      expectedAmount: '1000000',
      expectedMemo: deriveChallengeReference('challenge-4'),
      expectedRecipient: RECIPIENT,
      expectedToken: TOKEN,
      logs: [
        {
          address: TOKEN,
          data: encodeAbiParameters([{ name: 'amount', type: 'uint256' }], [1000000n]),
          topics: encodeEventTopics({
            abi: tempoTip20TransferAbi,
            eventName: 'Transfer',
            args: {
              from: FROM,
              to: RECIPIENT,
            },
          }) as readonly `0x${string}`[],
        },
      ],
    })

    assert.deepEqual(matched, {
      matches: false,
      missingReference: true,
    })
  })
})
