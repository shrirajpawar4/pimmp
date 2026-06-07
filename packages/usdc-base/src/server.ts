import { Method, Receipt } from 'mppx'
import { createPublicClient, getAddress, http, isAddressEqual } from 'viem'
import { base } from 'viem/chains'

import {
  type VerifyTransferFn,
  type VerifyTransferResult,
  USDC_BASE_ADDRESS,
  USDC_BASE_CHAIN_ID,
  receiptMatchesTransfer,
  usdcBaseMethod,
} from './shared.js'

const CONFIRMATION_POLL_INTERVAL_MS = 1_000
const CONFIRMATION_POLL_ATTEMPTS = 10
const CONFIRMATION_BLOCKS = 1

export type UsdcBaseServerOptions = {
  confirmationBlocks?: number
  confirmationPollAttempts?: number
  confirmationPollIntervalMs?: number
  rpcUrl?: string
  verifyTransfer?: VerifyTransferFn
}

type RpcClient = {
  getBlockNumber(): Promise<bigint>
  getTransactionReceipt(parameters: { hash: `0x${string}` }): Promise<{
    blockNumber: bigint
    logs: Parameters<typeof receiptMatchesTransfer>[0]['logs']
    status: 'success' | 'reverted'
  }>
}

type VerifyTransferWithRpcParameters = {
  challengeId: string
  confirmationBlocks?: number
  confirmationPollAttempts?: number
  confirmationPollIntervalMs?: number
  request: {
    amount: string
    currency: 'usdc'
    recipient: string
    methodDetails: {
      chainId: number
      network: 'base'
      token: string
    }
  }
  rpcUrl?: string
  txid: string
}

type VerifyTransferWithRpcInternals = {
  client?: RpcClient
  delay?: (ms: number) => Promise<void>
}

export function usdcBase(parameters: UsdcBaseServerOptions = {}) {
  return Method.toServer(usdcBaseMethod, {
    async verify({ credential, request }) {
      const txid = credential.payload.txid
      const challengeId = credential.challenge.id
      const result = parameters.verifyTransfer
        ? await parameters.verifyTransfer({ challengeId, request, txid })
        : await verifyTransferWithRpc({
            challengeId,
            confirmationBlocks: parameters.confirmationBlocks,
            confirmationPollAttempts: parameters.confirmationPollAttempts,
            confirmationPollIntervalMs: parameters.confirmationPollIntervalMs,
            request,
            rpcUrl: parameters.rpcUrl,
            txid,
          })

      if (!result.valid) {
        throw new Error('payment not verified')
      }

      return Receipt.from({
        method: usdcBaseMethod.name,
        status: 'success',
        timestamp: new Date().toISOString(),
        reference: result.txid,
      })
    },
  })
}

export function verifyTransferWithRpc(
  parameters: VerifyTransferWithRpcParameters,
): Promise<VerifyTransferResult>
export async function verifyTransferWithRpc(
  parameters: VerifyTransferWithRpcParameters & VerifyTransferWithRpcInternals,
): Promise<VerifyTransferResult> {
  const { request, txid } = parameters
  const confirmationBlocks = parsePositiveIntegerOption(
    parameters.confirmationBlocks,
    'confirmationBlocks',
    CONFIRMATION_BLOCKS,
  )
  const confirmationPollAttempts = parsePositiveIntegerOption(
    parameters.confirmationPollAttempts,
    'confirmationPollAttempts',
    CONFIRMATION_POLL_ATTEMPTS,
  )
  const confirmationPollIntervalMs = parsePositiveIntegerOption(
    parameters.confirmationPollIntervalMs,
    'confirmationPollIntervalMs',
    CONFIRMATION_POLL_INTERVAL_MS,
  )
  if (!parameters.rpcUrl && !parameters.client) {
    throw new Error('rpcUrl is required when verifyTransfer is not provided')
  }
  if (request.methodDetails.chainId !== USDC_BASE_CHAIN_ID) {
    throw new Error('unsupported chainId')
  }
  if (!isAddressEqual(getAddress(request.methodDetails.token), USDC_BASE_ADDRESS)) {
    throw new Error('unsupported token')
  }

  const client =
    parameters.client ??
    createPublicClient({
      chain: base,
      transport: http(parameters.rpcUrl),
    })
  const wait = parameters.delay ?? delay

  const receipt = await client.getTransactionReceipt({ hash: txid as `0x${string}` })
  if (receipt.status !== 'success') {
    return { txid, valid: false }
  }

  let currentBlock = await client.getBlockNumber()
  const requiredConfirmations = BigInt(confirmationBlocks)
  for (
    let attempt = 0;
    currentBlock - receipt.blockNumber < requiredConfirmations && attempt < confirmationPollAttempts;
    attempt += 1
  ) {
    await wait(confirmationPollIntervalMs)
    currentBlock = await client.getBlockNumber()
  }

  if (currentBlock - receipt.blockNumber < requiredConfirmations) {
    return { txid, valid: false }
  }

  const matched = receiptMatchesTransfer({
    expectedAmount: request.amount,
    expectedRecipient: request.recipient,
    logs: receipt.logs,
  })
  return {
    observedAmount: matched.observedAmount,
    recipient: matched.recipient,
    txid,
    valid: matched.matches,
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parsePositiveIntegerOption(value: number | undefined, name: string, defaultValue: number) {
  if (value === undefined) {
    return defaultValue
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }

  return value
}
