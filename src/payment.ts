import { verifyTransferWithRpc } from '@pimpp/usdc-base'
import { getAddress, isAddressEqual } from 'viem'

import { logError, logStage, logSuccess, logWarn } from './log.js'
import { matchRoutePrice } from './registry.js'
import { getChallenge, isSpent, markSpent } from './replay.js'
import type { Bindings, PimpEndpoint } from './types.js'

export async function validateAndConsumePayment(parameters: {
  challengeId: string
  endpoint: PimpEndpoint
  env: Bindings
  txid: string
}) {
  const { challengeId, endpoint, env, txid } = parameters
  logStage('VERIFY', `start id=${endpoint.id} challenge=${challengeId} txid=${txid}`)

  if (await isSpent(env, txid)) {
    logWarn('REPLAY', `reused txid=${txid} id=${endpoint.id}`)
    return { valid: false, error: 'transaction already spent' }
  }

  const challenge = await getChallenge(env, challengeId)
  if (!challenge) {
    logError('VERIFY', `missing challenge id=${endpoint.id} challenge=${challengeId}`)
    return { valid: false, error: 'challenge not found or expired' }
  }

  if (challenge.expiresAt < Date.now()) {
    logError('VERIFY', `expired challenge id=${endpoint.id} challenge=${challengeId}`)
    return { valid: false, error: 'challenge expired' }
  }

  if (challenge.endpointId !== endpoint.id) {
    logError(
      'VERIFY',
      `endpoint mismatch expected=${challenge.endpointId} actual=${endpoint.id}`,
    )
    return { valid: false, error: 'challenge endpoint mismatch' }
  }

  const matchedRoute = matchRoutePrice(endpoint, challenge.routePath)
  if (!matchedRoute) {
    logError('VERIFY', `missing route price id=${endpoint.id} route=${challenge.routePath}`)
    return { valid: false, error: 'challenge route mismatch' }
  }

  if (
    challenge.routePath !== matchedRoute.path ||
    challenge.expectedAmount !== matchedRoute.priceAtomic ||
    !isAddressEqual(getAddress(challenge.expectedRecipient), getAddress(endpoint.destinationWallet))
  ) {
    logError('VERIFY', `payment details mismatch id=${endpoint.id} txid=${txid}`)
    return { valid: false, error: 'challenge payment details mismatch' }
  }

  const result = await verifyTransferWithRpc({
    challengeId,
    request: {
      amount: matchedRoute.priceAtomic,
      currency: 'usdc',
      recipient: endpoint.destinationWallet,
      methodDetails: {
        chainId: 8453,
        network: 'base',
        token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      },
    },
    rpcUrl: env.BASE_RPC_URL,
    txid,
  })

  if (!result.valid) {
    logError('VERIFY', `transfer did not match id=${endpoint.id} txid=${txid}`)
    return { valid: false, error: 'payment transfer did not match challenge' }
  }

  await markSpent(env, txid)
  logSuccess(
    'PAID',
    `verified id=${endpoint.id} txid=${txid} route=${matchedRoute.path} amount=${matchedRoute.priceAtomic} recipient=${endpoint.destinationWallet}`,
  )
  return { valid: true }
}
