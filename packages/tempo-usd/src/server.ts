import { Method, Receipt } from 'mppx'
import { createPublicClient, http } from 'viem'
import { tempo, tempoModerato } from 'viem/chains'

import {
  deriveChallengeReference,
  receiptMatchesTransferWithReference,
  type TempoUsdRequest,
  type VerifyTransferFn,
  type VerifyTransferResult,
  tempoUsdMethod,
  tempoUsdRequestSchema,
} from './shared.js'

export type TempoUsdServerOptions = {
  rpcUrl?: string
  verifyTransfer?: VerifyTransferFn
}

export function tempoUsd(parameters: TempoUsdServerOptions = {}) {
  return Method.toServer(tempoUsdMethod, {
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
        method: tempoUsdMethod.name,
        status: 'success',
        timestamp: new Date().toISOString(),
        reference: result.txid,
      })
    },
  })
}

export async function verifyTransferWithRpc(parameters: {
  challengeId: string
  request: TempoUsdRequest
  rpcUrl?: string
  txid: string
}): Promise<VerifyTransferResult> {
  const { challengeId, rpcUrl, txid } = parameters
  const request = tempoUsdRequestSchema.parse(parameters.request)
  if (!rpcUrl) {
    throw new Error('rpcUrl is required when verifyTransfer is not provided')
  }

  const client = createPublicClient({
    chain: getTempoChain(request.methodDetails.chainId),
    transport: http(rpcUrl),
  })

  const receipt = await client.getTransactionReceipt({ hash: txid as `0x${string}` })
  if (receipt.status !== 'success') {
    return { txid, valid: false }
  }

  const expectedMemo = deriveChallengeReference(challengeId)
  const matched = receiptMatchesTransferWithReference({
    expectedAmount: request.amount,
    expectedMemo,
    expectedRecipient: request.recipient,
    expectedToken: request.methodDetails.token,
    logs: receipt.logs,
  })

  return {
    missingReference: matched.missingReference,
    observedAmount: matched.observedAmount,
    observedMemo: matched.observedMemo,
    recipient: matched.recipient,
    txid,
    valid: matched.matches,
  }
}

function getTempoChain(chainId: TempoUsdRequest['methodDetails']['chainId']) {
  if (chainId === tempo.id) {
    return tempo
  }
  return tempoModerato
}
