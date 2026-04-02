import { nanoid } from 'nanoid'
import { getAddress, isAddress, isAddressEqual, parseUnits } from 'viem'

import { decryptMap, encryptMap } from './crypto.js'
import type { Bindings, PimpEndpoint, RegisterEndpointInput, StoredEndpoint } from './types.js'

const MIN_PRICE_ATOMIC = 1_000n
const MAX_PRICE_ATOMIC = 100_000_000n
const DISALLOWED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254',
])

export async function registerEndpoint(env: Bindings, origin: string, input: RegisterEndpointInput) {
  const originUrl = validateOriginUrl(input.originUrl)
  const priceAtomic = normalizePrice(input.priceUsdc)
  const destinationWallet = validateDestinationWallet(input.destinationWallet)
  const id = nanoid(10)

  const stored: StoredEndpoint = {
    callCount: 0,
    createdAt: Date.now(),
    destinationWallet,
    id,
    originUrl: originUrl.toString(),
    priceAtomic,
    upstreamHeaders: await encryptMap(input.upstreamHeaders, env.PIMP_DATA_KEY),
    upstreamQuery: await encryptMap(input.upstreamQuery, env.PIMP_DATA_KEY),
  }

  await env.ENDPOINTS.put(id, JSON.stringify(stored))
  return {
    id,
    proxiedUrl: new URL(`/p/${id}`, origin).toString(),
  }
}

export async function getEndpoint(env: Bindings, id: string): Promise<PimpEndpoint | null> {
  const raw = await env.ENDPOINTS.get(id)
  if (!raw) return null
  const stored = JSON.parse(raw) as StoredEndpoint
  return hydrateEndpoint(env, stored)
}

export async function incrementCallCount(env: Bindings, endpoint: PimpEndpoint) {
  const raw = await env.ENDPOINTS.get(endpoint.id)
  if (!raw) return
  const stored = JSON.parse(raw) as StoredEndpoint
  stored.callCount += 1
  await env.ENDPOINTS.put(endpoint.id, JSON.stringify(stored))
}

export function validateOriginUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('originUrl must be a valid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('originUrl must use http or https')
  }
  if (DISALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('originUrl host is not allowed')
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error('originUrl host is not allowed')
  }
  return url
}

export function normalizePrice(value: string) {
  let atomic: bigint
  try {
    atomic = parseUnits(value, 6)
  } catch {
    throw new Error('priceUsdc must be a decimal USDC amount')
  }
  if (atomic < MIN_PRICE_ATOMIC || atomic > MAX_PRICE_ATOMIC) {
    throw new Error('priceUsdc must be between 0.001 and 100')
  }
  return atomic.toString()
}

export function validateDestinationWallet(value: string) {
  if (!isAddress(value)) {
    throw new Error('destinationWallet must be a valid EVM address')
  }
  return getAddress(value)
}

async function hydrateEndpoint(env: Bindings, stored: StoredEndpoint): Promise<PimpEndpoint> {
  return {
    callCount: stored.callCount,
    createdAt: stored.createdAt,
    destinationWallet: stored.destinationWallet,
    id: stored.id,
    originUrl: stored.originUrl,
    priceAtomic: stored.priceAtomic,
    upstreamHeaders: await decryptMap(stored.upstreamHeaders, env.PIMP_DATA_KEY),
    upstreamQuery: await decryptMap(stored.upstreamQuery, env.PIMP_DATA_KEY),
  }
}

function isPrivateHost(hostname: string) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    const octets = hostname.split('.').map(Number)
    if (octets[0] === 127 || octets[0] === 10) return true
    if (octets[0] === 169 && octets[1] === 254) return true
    if (octets[0] === 192 && octets[1] === 168) return true
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true
  }
  return false
}
