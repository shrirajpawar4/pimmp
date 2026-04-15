import { logError, logStage, logSuccess, logWarn } from './log.js'
import { getPaymentAdapter } from './payments/index.js'
import { matchRoutePrice } from './registry.js'
import { getChallenge, isSpent, markSpent } from './replay.js'
import type { Bindings, ChallengeState, LegacyChallengeState, PaymentCharge, PimpEndpoint } from './types.js'

export async function validateAndConsumePayment(parameters: {
  challengeId: string
  endpoint: PimpEndpoint
  env: Bindings
  txid: string
}) {
  const { challengeId, endpoint, env, txid } = parameters
  logStage('VERIFY', `start id=${endpoint.id} challenge=${challengeId} txid=${txid}`)

  const resolution = resolvePaymentVerification({
    challenge: await getChallenge(env, challengeId),
    endpoint,
    txidSpent: await isSpent(env, txid),
  })

  if (!resolution.ok) {
    if (resolution.error === 'transaction already spent') {
      logWarn('REPLAY', `reused txid=${txid} id=${endpoint.id}`)
    } else if (
      resolution.error === 'challenge not found or expired' ||
      resolution.error === 'challenge expired' ||
      resolution.error === 'challenge endpoint mismatch' ||
      resolution.error === 'challenge route mismatch' ||
      resolution.error === 'challenge payment method mismatch' ||
      resolution.error === 'challenge payment details mismatch'
    ) {
      logError('VERIFY', `${resolution.error} id=${endpoint.id} challenge=${challengeId}`)
    }
    return { valid: false, error: resolution.error }
  }

  let result
  try {
    result = await resolution.adapter.verifyTransfer({
      challengeId,
      env,
      request: resolution.chargeRequest,
      txid,
    })
  } catch (error) {
    logError(
      'VERIFY',
      `verification threw id=${endpoint.id} txid=${txid} error=${error instanceof Error ? error.message : String(error)}`,
    )
    return { valid: false, error: 'payment transfer did not match challenge' }
  }

  if (!result.valid) {
    logError('VERIFY', `transfer did not match id=${endpoint.id} txid=${txid}`)
    return { valid: false, error: 'payment transfer did not match challenge' }
  }

  await markSpent(env, txid)
  logSuccess(
    'PAID',
    `verified id=${endpoint.id} txid=${txid} route=${resolution.matchedRoute.path} amount=${resolution.matchedRoute.priceAtomic} recipient=${resolution.chargeRequest.recipient}`,
  )
  return { valid: true }
}

export function resolvePaymentVerification(parameters: {
  challenge: ChallengeState | LegacyChallengeState | null
  endpoint: PimpEndpoint
  now?: number
  txidSpent: boolean
}):
  | {
      ok: true
      adapter: ReturnType<typeof getPaymentAdapter>
      chargeRequest: PaymentCharge
      matchedRoute: NonNullable<ReturnType<typeof matchRoutePrice>>
    }
  | {
      error:
        | 'challenge endpoint mismatch'
        | 'challenge expired'
        | 'challenge not found or expired'
        | 'challenge payment details mismatch'
        | 'challenge payment method mismatch'
        | 'challenge route mismatch'
        | 'transaction already spent'
      ok: false
    } {
  const { challenge, endpoint, txidSpent } = parameters
  const now = parameters.now ?? Date.now()

  if (txidSpent) {
    return { ok: false, error: 'transaction already spent' }
  }

  if (!challenge) {
    return { ok: false, error: 'challenge not found or expired' }
  }

  if (challenge.expiresAt < now) {
    return { ok: false, error: 'challenge expired' }
  }

  if (challenge.endpointId !== endpoint.id) {
    return { ok: false, error: 'challenge endpoint mismatch' }
  }

  const matchedRoute = matchRoutePrice(endpoint, challenge.routePath)
  if (!matchedRoute || challenge.routePath !== matchedRoute.path) {
    return { ok: false, error: 'challenge route mismatch' }
  }

  const adapter = getPaymentAdapter(endpoint.payment.method)
  if ('paymentMethod' in challenge && challenge.paymentMethod !== endpoint.payment.method) {
    return { ok: false, error: 'challenge payment method mismatch' }
  }

  const chargeRequest = adapter.buildChargeRequest(endpoint, matchedRoute)
  const storedChargeRequest = toStoredChargeRequest(challenge, endpoint)
  if (!storedChargeRequest || !adapter.matchesStoredChargeRequest(storedChargeRequest, chargeRequest)) {
    return { ok: false, error: 'challenge payment details mismatch' }
  }

  return {
    ok: true,
    adapter,
    chargeRequest: adapter.serializeChargeRequest(chargeRequest),
    matchedRoute,
  }
}

function toStoredChargeRequest(
  challenge: ChallengeState | LegacyChallengeState,
  endpoint: Pick<PimpEndpoint, 'id' | 'payment'>,
): PaymentCharge | null {
  if ('paymentMethod' in challenge) {
    return challenge.chargeRequest
  }

  if (endpoint.payment.method !== 'usdc-base') {
    return null
  }

  return {
    amount: challenge.expectedAmount,
    currency: 'usdc',
    recipient: challenge.expectedRecipient,
    description: `Proxy access for ${endpoint.id}${challenge.routePath}`,
    methodDetails: {
      chainId: endpoint.payment.chainId,
      network: endpoint.payment.network,
      token: endpoint.payment.token,
    },
  }
}
