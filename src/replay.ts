import { Redis } from '@upstash/redis/cloudflare'

import type { Bindings, ChallengeState, LegacyChallengeState } from './types.js'

const CHALLENGE_TTL_SECONDS = 300
export const SPENT_TTL_SECONDS = 60 * 60 * 24

function getRedis(env: Bindings) {
  return new Redis({
    token: env.UPSTASH_REDIS_REST_TOKEN,
    url: env.UPSTASH_REDIS_REST_URL,
  })
}

export async function storeChallenge(env: Bindings, challengeId: string, state: ChallengeState) {
  await getRedis(env).set(`challenge:${challengeId}`, state, {
    ex: CHALLENGE_TTL_SECONDS,
  })
}

export async function getChallenge(env: Bindings, challengeId: string) {
  return getRedis(env).get<ChallengeState | LegacyChallengeState>(`challenge:${challengeId}`)
}

export async function claimTxid(env: Bindings, txid: string) {
  const result = await getRedis(env).set(`spent:${txid}`, '1', {
    nx: true,
    ex: SPENT_TTL_SECONDS,
  })
  return result === 'OK'
}

export async function isSpent(env: Bindings, txid: string) {
  // Fast-fail optimization only. The atomic claim is the replay security boundary.
  return (await getRedis(env).get(`spent:${txid}`)) !== null
}
