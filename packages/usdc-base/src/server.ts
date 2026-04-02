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

export type UsdcBaseServerOptions = {
  rpcUrl?: string
  verifyTransfer?: VerifyTransferFn
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

export async function verifyTransferWithRpc(parameters: {
  challengeId: string
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
}): Promise<VerifyTransferResult> {
  const { request, rpcUrl, txid } = parameters
  if (!rpcUrl) {
    throw new Error('rpcUrl is required when verifyTransfer is not provided')
  }
  if (request.methodDetails.chainId !== USDC_BASE_CHAIN_ID) {
    throw new Error('unsupported chainId')
  }
  if (!isAddressEqual(getAddress(request.methodDetails.token), USDC_BASE_ADDRESS)) {
    throw new Error('unsupported token')
  }

  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  })

  const receipt = await client.getTransactionReceipt({ hash: txid as `0x${string}` })
  if (receipt.status !== 'success') {
    return { txid, valid: false }
  }

  let currentBlock = await client.getBlockNumber()
  for (
    let attempt = 0;
    currentBlock - receipt.blockNumber < 1n && attempt < CONFIRMATION_POLL_ATTEMPTS;
    attempt += 1
  ) {
    await delay(CONFIRMATION_POLL_INTERVAL_MS)
    currentBlock = await client.getBlockNumber()
  }

  if (currentBlock - receipt.blockNumber < 1n) {
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
