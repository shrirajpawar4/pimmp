import { Method, z } from 'mppx'
import {
  decodeEventLog,
  getAddress,
  isAddressEqual,
  keccak256,
  stringToHex,
} from 'viem'
import { tempo, tempoModerato } from 'viem/chains'

export const TEMPO_MAINNET_CHAIN_ID = tempo.id
export const TEMPO_MODERATO_CHAIN_ID = tempoModerato.id
export const tempoUsdMethodName = 'tempo-usd'

export const tempoTip20TransferAbi = [
  {
    name: 'Transfer',
    type: 'event',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
  },
  {
    name: 'TransferWithMemo',
    type: 'event',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: true, name: 'memo', type: 'bytes32' },
    ],
  },
] as const

const tempoChainIdSchema = z.union([
  z.literal(TEMPO_MAINNET_CHAIN_ID),
  z.literal(TEMPO_MODERATO_CHAIN_ID),
])

export const tempoUsdRequestSchema = z.object({
  amount: z.string(),
  currency: z.literal('usd'),
  recipient: z.string(),
  description: z.optional(z.string()),
  methodDetails: z.object({
    chainId: tempoChainIdSchema,
    network: z.literal('tempo'),
    referenceStrategy: z.literal('challenge-id-keccak256'),
    token: z.string(),
  }),
})

export const tempoUsdCredentialPayloadSchema = z.object({
  txid: z.string(),
})

export const tempoUsdMethod = Method.from({
  name: tempoUsdMethodName,
  intent: 'charge',
  schema: {
    request: tempoUsdRequestSchema,
    credential: {
      payload: tempoUsdCredentialPayloadSchema,
    },
  },
})

export type TempoUsdRequest = z.output<typeof tempoUsdRequestSchema>
export type TempoUsdCredentialPayload = z.output<typeof tempoUsdCredentialPayloadSchema>

export type VerifyTransferResult = {
  error?: string
  missingReference?: boolean
  observedAmount?: string
  observedMemo?: string
  recipient?: string
  txid: string
  valid: boolean
}

export type VerifyTransferFn = (parameters: {
  challengeId: string
  request: TempoUsdRequest
  txid: string
}) => Promise<VerifyTransferResult>

export function deriveChallengeReference(challengeId: string): `0x${string}` {
  return keccak256(stringToHex(challengeId))
}

export function didFromAddress(address: string, chainId: number): string {
  return `did:pkh:eip155:${chainId}:${getAddress(address)}`
}

export function isTempoChainId(value: number): value is TempoUsdRequest['methodDetails']['chainId'] {
  return value === TEMPO_MAINNET_CHAIN_ID || value === TEMPO_MODERATO_CHAIN_ID
}

export function receiptMatchesTransferWithReference(parameters: {
  expectedAmount: string
  expectedMemo: `0x${string}`
  expectedRecipient: string
  expectedToken: string
  logs: readonly {
    address?: `0x${string}` | string
    data: `0x${string}`
    topics: readonly `0x${string}`[]
  }[]
}): {
  matches: boolean
  missingReference: boolean
  observedAmount?: string
  observedMemo?: string
  recipient?: string
} {
  const { expectedAmount, expectedMemo, expectedRecipient, expectedToken, logs } = parameters
  let missingReference = false

  for (const log of logs) {
    if (!log.address || !addressesMatch(log.address, expectedToken)) continue

    try {
      const decoded = decodeEventLog({
        abi: tempoTip20TransferAbi,
        data: log.data,
        topics: [...log.topics] as [`0x${string}`, ...`0x${string}`[]],
      })

      if (decoded.eventName === 'Transfer') {
        if (
          decoded.args.to &&
          decoded.args.amount !== undefined &&
          addressesMatch(decoded.args.to, expectedRecipient) &&
          decoded.args.amount.toString() === expectedAmount
        ) {
          missingReference = true
        }
        continue
      }

      if (
        decoded.eventName === 'TransferWithMemo' &&
        decoded.args.to &&
        decoded.args.amount !== undefined &&
        decoded.args.memo
      ) {
        const recipient = getAddress(decoded.args.to)
        const observedAmount = decoded.args.amount.toString()
        const observedMemo = decoded.args.memo
        if (
          addressesMatch(recipient, expectedRecipient) &&
          observedAmount === expectedAmount &&
          observedMemo === expectedMemo
        ) {
          return {
            matches: true,
            missingReference: false,
            observedAmount,
            observedMemo,
            recipient,
          }
        }
      }
    } catch {
      continue
    }
  }

  return {
    matches: false,
    missingReference,
  }
}

function addressesMatch(left: string, right: string) {
  try {
    return isAddressEqual(getAddress(left), getAddress(right))
  } catch {
    return false
  }
}
