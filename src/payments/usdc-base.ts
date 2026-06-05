import {
  USDC_BASE_ADDRESS,
  USDC_BASE_CHAIN_ID,
  usdcBase,
  usdcBaseRequestSchema,
  verifyTransferWithRpc,
} from '@pimpp/usdc-base'
import { getAddress, isAddressEqual } from 'viem'

import type { Bindings, PaymentCharge, PimpEndpoint, RegisterEndpointPaymentInput } from '../types.js'
import type { PaymentMethodAdapter } from './types.js'

export const usdcBaseAdapter: PaymentMethodAdapter = {
  method: 'usdc-base',
  createServerMethod(env, verifyTransfer) {
    return usdcBase({
      rpcUrl: env.BASE_RPC_URL,
      verifyTransfer,
    })
  },
  buildChargeRequest(endpoint, matchedRoute) {
    if (endpoint.payment.method !== 'usdc-base') {
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
        token: endpoint.payment.token,
      },
    }
  },
  serializeChargeRequest(request) {
    return {
      amount: request.amount,
      currency: request.currency,
      recipient: request.recipient,
      ...(request.description ? { description: request.description } : {}),
      methodDetails: {
        chainId: request.methodDetails.chainId,
        network: request.methodDetails.network,
        token: request.methodDetails.token,
      },
    }
  },
  matchesStoredChargeRequest(stored, request) {
    const parsedRequest = usdcBaseRequestSchema.parse(request)
    if (stored.amount !== request.amount || stored.currency !== request.currency) {
      return false
    }

    if (stored.description !== parsedRequest.description) {
      return false
    }

    if (!addressesMatch(stored.recipient, parsedRequest.recipient)) {
      return false
    }

    const storedMethodDetails = stored.methodDetails
    const { chainId, network, token } = parsedRequest.methodDetails
    return (
      typeof storedMethodDetails.chainId === 'number' &&
      storedMethodDetails.chainId === chainId &&
      storedMethodDetails.network === network &&
      typeof storedMethodDetails.token === 'string' &&
      addressesMatch(storedMethodDetails.token, token)
    )
  },
  async verifyTransfer(parameters) {
    const { challengeId, env, request, txid } = parameters
    return verifyTransferWithRpc({
      challengeId,
      request: usdcBaseRequestSchema.parse(request),
      rpcUrl: env.BASE_RPC_URL,
      txid,
    })
  },
}

export function createDefaultUsdcBasePayment(recipient: string): PimpEndpoint['payment'] {
  return {
    method: 'usdc-base',
    recipient: getAddress(recipient),
    currency: 'usdc',
    network: 'base',
    chainId: USDC_BASE_CHAIN_ID,
    token: USDC_BASE_ADDRESS,
  }
}

export function normalizeUsdcBasePaymentInput(
  payment: Extract<RegisterEndpointPaymentInput, { method: 'usdc-base' }>,
) {
  if (payment.network && payment.network !== 'base') {
    throw new Error('usdc-base network must be base')
  }
  if (payment.chainId && payment.chainId !== USDC_BASE_CHAIN_ID) {
    throw new Error(`usdc-base chainId must be ${USDC_BASE_CHAIN_ID}`)
  }
  if (payment.token && !addressesMatch(payment.token, USDC_BASE_ADDRESS)) {
    throw new Error(`usdc-base token must be ${USDC_BASE_ADDRESS}`)
  }

  return createDefaultUsdcBasePayment(payment.recipient)
}

function addressesMatch(left: string, right: string) {
  try {
    return isAddressEqual(getAddress(left), getAddress(right))
  } catch {
    return false
  }
}
