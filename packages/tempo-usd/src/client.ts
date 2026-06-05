import { Credential, Method } from 'mppx'
import { createClient, getAddress, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempo, tempoModerato } from 'viem/chains'
import { Actions } from 'viem/tempo'

import {
  deriveChallengeReference,
  didFromAddress,
  type TempoUsdRequest,
  tempoUsdMethod,
} from './shared.js'

export type CreatePaymentFn = (parameters: {
  challengeId: string
  request: TempoUsdRequest
}) => Promise<{ source?: string; txid: string }>

export type TempoUsdClientOptions = {
  createPayment?: CreatePaymentFn
  privateKey?: `0x${string}`
  rpcUrl?: string
  source?: string
}

export function tempoUsdClient(parameters: TempoUsdClientOptions = {}) {
  return Method.toClient(tempoUsdMethod, {
    async createCredential({ challenge }) {
      const payment = parameters.createPayment
        ? await parameters.createPayment({
            challengeId: challenge.id,
            request: challenge.request,
          })
        : await createPaymentWithKey({
            challengeId: challenge.id,
            privateKey: parameters.privateKey,
            request: challenge.request,
            rpcUrl: parameters.rpcUrl,
          })

      return Credential.serialize({
        challenge,
        payload: {
          txid: payment.txid,
        },
        ...(payment.source ?? parameters.source
          ? { source: payment.source ?? parameters.source }
          : {}),
      })
    },
  })
}

export async function createPaymentWithKey(parameters: {
  challengeId: string
  privateKey?: `0x${string}`
  request: TempoUsdRequest
  rpcUrl?: string
}): Promise<{ source: string; txid: string }> {
  const { challengeId, privateKey, request, rpcUrl } = parameters
  if (!privateKey) {
    throw new Error('privateKey is required when createPayment is not provided')
  }
  if (!rpcUrl) {
    throw new Error('rpcUrl is required when createPayment is not provided')
  }

  const account = privateKeyToAccount(privateKey)
  const recipient = getAddress(request.recipient)
  const token = getAddress(request.methodDetails.token)
  const client = createClient({
    account,
    chain: getTempoChain(request.methodDetails.chainId, token),
    transport: http(rpcUrl),
  })

  const result = await Actions.token.transferSync(client, {
    amount: BigInt(request.amount),
    memo: deriveChallengeReference(challengeId),
    to: recipient,
    token,
  })

  return {
    source: didFromAddress(account.address, request.methodDetails.chainId),
    txid: result.receipt.transactionHash,
  }
}

function getTempoChain(
  chainId: TempoUsdRequest['methodDetails']['chainId'],
  feeToken: `0x${string}`,
) {
  if (chainId === tempo.id) {
    return tempo.extend({ feeToken })
  }
  return tempoModerato.extend({ feeToken })
}
