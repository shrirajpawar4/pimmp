import { Method, z } from 'mppx'
import { decodeEventLog, encodeFunctionData, erc20Abi, formatUnits, getAddress, isAddressEqual } from 'viem'
import { base } from 'viem/chains'

export const USDC_BASE_ADDRESS = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
export const USDC_DECIMALS = 6
export const USDC_BASE_CHAIN_ID = base.id
export const usdcBaseMethodName = 'usdc-base'

export const usdcBaseRequestSchema = z.object({
  amount: z.string(),
  currency: z.literal('usdc'),
  recipient: z.string(),
  description: z.optional(z.string()),
  methodDetails: z.object({
    chainId: z.literal(USDC_BASE_CHAIN_ID),
    network: z.literal('base'),
    token: z.literal(USDC_BASE_ADDRESS),
  }),
})

export const usdcBaseCredentialPayloadSchema = z.object({
  txid: z.string(),
})

export const usdcBaseMethod = Method.from({
  name: usdcBaseMethodName,
  intent: 'charge',
  schema: {
    request: usdcBaseRequestSchema,
    credential: {
      payload: usdcBaseCredentialPayloadSchema,
    },
  },
})

export type UsdcBaseRequest = z.output<typeof usdcBaseRequestSchema>
export type UsdcBaseCredentialPayload = z.output<typeof usdcBaseCredentialPayloadSchema>

export type VerifyTransferResult = {
  observedAmount?: string
  recipient?: string
  txid: string
  valid: boolean
}

export type VerifyTransferFn = (parameters: {
  challengeId: string
  request: UsdcBaseRequest
  txid: string
}) => Promise<VerifyTransferResult>

export function buildTransferData(to: string, amountAtomic: string): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [getAddress(to), BigInt(amountAtomic)],
  })
}

export function didFromAddress(address: string): string {
  return `did:pkh:eip155:${USDC_BASE_CHAIN_ID}:${getAddress(address)}`
}

export function amountDecimal(amountAtomic: string): string {
  return formatUnits(BigInt(amountAtomic), USDC_DECIMALS)
}

export function receiptMatchesTransfer(parameters: {
  expectedAmount: string
  expectedRecipient: string
  logs: readonly {
    address?: `0x${string}` | string
    data: `0x${string}`
    topics: readonly `0x${string}`[]
  }[]
}): { matches: boolean; observedAmount?: string; recipient?: string } {
  const { expectedAmount, expectedRecipient, logs } = parameters
  for (const log of logs) {
    if (!log.address || !isAddressEqual(getAddress(log.address), USDC_BASE_ADDRESS)) continue
    const decoded = decodeEventLog({
      abi: erc20Abi,
      data: log.data,
      topics: [...log.topics] as [`0x${string}`, ...`0x${string}`[]],
    })
    if (decoded.eventName !== 'Transfer') continue
    if (!decoded.args.to || decoded.args.value === undefined) continue
    const recipient = getAddress(decoded.args.to)
    const observedAmount = decoded.args.value.toString()
    if (
      isAddressEqual(recipient, getAddress(expectedRecipient)) &&
      observedAmount === expectedAmount
    ) {
      return { matches: true, observedAmount, recipient }
    }
  }

  return { matches: false }
}
