import {
  TEMPO_MAINNET_CHAIN_ID,
  TEMPO_MODERATO_CHAIN_ID,
  isTempoChainId,
  tempoUsd,
  tempoUsdRequestSchema,
  verifyTransferWithRpc,
} from '../../packages/tempo-usd/src/index.js'
import { getAddress, isAddressEqual } from 'viem'

import type {
  Bindings,
  EndpointPaymentConfig,
  PaymentCharge,
  PimpEndpoint,
  RegisterEndpointPaymentInput,
} from '../types.js'
import type { PaymentMethodAdapter } from './types.js'

export const tempoUsdAdapter: PaymentMethodAdapter = {
  method: 'tempo-usd',
  createServerMethod(env, verifyTransfer) {
    return tempoUsd({
      rpcUrl: env.TEMPO_RPC_URL,
      verifyTransfer,
    })
  },
  buildChargeRequest(endpoint, matchedRoute) {
    if (endpoint.payment.method !== 'tempo-usd') {
      throw new Error(`Unsupported payment method: ${endpoint.payment.method}`)
    }

    return {
      amount: matchedRoute.priceAtomic,
      currency: endpoint.payment.currency,
      recipient: endpoint.payment.recipient,
      description: `Proxy access for ${endpoint.id}${matchedRoute.path}`,
      methodDetails: {
        chainId: endpoint.payment.chainId,
        network: endpoint.payment.network,
        referenceStrategy: 'challenge-id-keccak256',
        token: endpoint.payment.token,
      },
    }
  },
  serializeChargeRequest(request) {
    const parsedRequest = tempoUsdRequestSchema.parse(request)
    return {
      amount: parsedRequest.amount,
      currency: parsedRequest.currency,
      recipient: parsedRequest.recipient,
      ...(parsedRequest.description ? { description: parsedRequest.description } : {}),
      methodDetails: {
        chainId: parsedRequest.methodDetails.chainId,
        network: parsedRequest.methodDetails.network,
        referenceStrategy: parsedRequest.methodDetails.referenceStrategy,
        token: parsedRequest.methodDetails.token,
      },
    }
  },
  matchesStoredChargeRequest(stored, request) {
    const parsedRequest = tempoUsdRequestSchema.parse(request)
    if (stored.amount !== parsedRequest.amount || stored.currency !== parsedRequest.currency) {
      return false
    }
    if (stored.description !== parsedRequest.description) {
      return false
    }
    if (!addressesMatch(stored.recipient, parsedRequest.recipient)) {
      return false
    }

    const storedMethodDetails = stored.methodDetails
    return (
      typeof storedMethodDetails.chainId === 'number' &&
      storedMethodDetails.chainId === parsedRequest.methodDetails.chainId &&
      storedMethodDetails.network === parsedRequest.methodDetails.network &&
      storedMethodDetails.referenceStrategy === parsedRequest.methodDetails.referenceStrategy &&
      typeof storedMethodDetails.token === 'string' &&
      addressesMatch(storedMethodDetails.token, parsedRequest.methodDetails.token)
    )
  },
  async verifyTransfer(parameters) {
    const { challengeId, env, request, txid } = parameters
    return verifyTransferWithRpc({
      challengeId,
      request: tempoUsdRequestSchema.parse(request),
      rpcUrl: env.TEMPO_RPC_URL,
      txid,
    })
  },
}

export function createTempoUsdPayment(parameters: {
  chainId: number
  recipient: string
  token: string
}): EndpointPaymentConfig {
  const { chainId, recipient, token } = parameters
  if (!isTempoChainId(chainId)) {
    throw new Error('tempo chainId must be 4217 or 42431')
  }

  return {
    method: 'tempo-usd',
    recipient: getAddress(recipient),
    currency: 'usd',
    network: 'tempo',
    chainId,
    token: getAddress(token),
  }
}

export function getTempoChainIdFromBindings(env: Bindings): number {
  const raw = env.TEMPO_CHAIN_ID
  if (!raw) {
    throw new Error('TEMPO_CHAIN_ID is required for tempo-usd payments')
  }

  const chainId = Number.parseInt(raw, 10)
  if (!Number.isInteger(chainId)) {
    throw new Error('TEMPO_CHAIN_ID must be an integer')
  }
  if (!isTempoChainId(chainId)) {
    throw new Error('TEMPO_CHAIN_ID must be 4217 or 42431')
  }

  return chainId
}

export function normalizeTempoUsdPaymentInput(
  env: Bindings,
  payment: Extract<RegisterEndpointPaymentInput, { method: 'tempo-usd' }>,
): EndpointPaymentConfig {
  if (!env.TEMPO_RPC_URL) {
    throw new Error('TEMPO_RPC_URL is required for tempo-usd payments')
  }
  if (payment.network && payment.network !== 'tempo') {
    throw new Error('tempo-usd network must be tempo')
  }

  return createTempoUsdPayment({
    chainId: payment.chainId ?? getTempoChainIdFromBindings(env),
    recipient: payment.recipient,
    token: payment.token,
  })
}

export const SUPPORTED_TEMPO_CHAIN_IDS = [
  TEMPO_MAINNET_CHAIN_ID,
  TEMPO_MODERATO_CHAIN_ID,
] as const

function addressesMatch(left: string, right: string) {
  try {
    return isAddressEqual(getAddress(left), getAddress(right))
  } catch {
    return false
  }
}
