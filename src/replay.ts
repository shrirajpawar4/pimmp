import { Redis } from '@upstash/redis/cloudflare'

import { parseOptionalPositiveInteger } from './config.js'
import type { Bindings, ChallengeState, LegacyChallengeState } from './types.js'

export const DEFAULT_CHALLENGE_TTL_SECONDS = 300
export const DEFAULT_SPENT_TTL_SECONDS = 60 * 60 * 24

function getRedis(env: Bindings) {
  return new Redis({
    token: env.UPSTASH_REDIS_REST_TOKEN,
    url: env.UPSTASH_REDIS_REST_URL,
  })
}

export async function storeChallenge(env: Bindings, challengeId: string, state: ChallengeState) {
  await getRedis(env).set(`challenge:${challengeId}`, state, {
    ex: getChallengeTtlSeconds(env),
  })
}

export async function getChallenge(env: Bindings, challengeId: string) {
  return getRedis(env).get<ChallengeState | LegacyChallengeState>(`challenge:${challengeId}`)
}

export async function claimTxid(env: Bindings, txid: string) {
  const result = await getRedis(env).set(`spent:${txid}`, '1', {
    nx: true,
    ex: getSpentTtlSeconds(env),
  })
  return result === 'OK'
}

export async function isSpent(env: Bindings, txid: string) {
  // Fast-fail optimization only. The atomic claim is the replay security boundary.
  return (await getRedis(env).get(`spent:${txid}`)) !== null
}

export function getChallengeTtlSeconds(env: Pick<Bindings, 'PIMP_CHALLENGE_TTL_SECONDS'>) {
  return parseOptionalPositiveInteger(
    env.PIMP_CHALLENGE_TTL_SECONDS,
    'PIMP_CHALLENGE_TTL_SECONDS',
    DEFAULT_CHALLENGE_TTL_SECONDS,
  )
}

export function getSpentTtlSeconds(env: Pick<Bindings, 'PIMP_SPENT_TTL_SECONDS'>) {
  return parseOptionalPositiveInteger(
    env.PIMP_SPENT_TTL_SECONDS,
    'PIMP_SPENT_TTL_SECONDS',
    DEFAULT_SPENT_TTL_SECONDS,
  )
}
