import { Credential, Method } from 'mppx'
import { createWalletClient, getAddress, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

import {
  buildTransferData,
  didFromAddress,
  type UsdcBaseRequest,
  usdcBaseMethod,
} from './shared.js'

export type CreatePaymentFn = (parameters: {
  challengeId: string
  request: UsdcBaseRequest
}) => Promise<{ source?: string; txid: string }>

export type UsdcBaseClientOptions = {
  createPayment?: CreatePaymentFn
  privateKey?: `0x${string}`
  rpcUrl?: string
  source?: string
}

export function usdcBaseClient(parameters: UsdcBaseClientOptions = {}) {
  return Method.toClient(usdcBaseMethod, {
    async createCredential({ challenge }) {
      const payment = parameters.createPayment
        ? await parameters.createPayment({
            challengeId: challenge.id,
            request: challenge.request,
          })
        : await createPaymentWithKey({
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
  privateKey?: `0x${string}`
  request: UsdcBaseRequest
  rpcUrl?: string
}): Promise<{ source: string; txid: string }> {
  const { privateKey, request, rpcUrl } = parameters
  if (!privateKey) {
    throw new Error('privateKey is required when createPayment is not provided')
  }
  if (!rpcUrl) {
    throw new Error('rpcUrl is required when createPayment is not provided')
  }

  const account = privateKeyToAccount(privateKey)
  const client = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  })

  const txid = await client.sendTransaction({
    account,
    data: buildTransferData(request.recipient, request.amount),
    to: getAddress(request.methodDetails.token),
  })

  return {
    source: didFromAddress(account.address),
    txid,
  }
}
