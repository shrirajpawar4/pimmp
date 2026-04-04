import { nanoid } from 'nanoid'
import { getAddress, isAddress, parseUnits } from 'viem'

import { decryptMap, encryptMap } from './crypto.js'
import type {
  Bindings,
  MatchedRoute,
  PimpEndpoint,
  RegisterEndpointInput,
  RegisterEndpointResult,
  StoredEndpoint,
} from './types.js'

const MIN_PRICE_ATOMIC = 1_000n
const MAX_PRICE_ATOMIC = 100_000_000n
const DEFAULT_ROUTE_PATH = '/'
const DISALLOWED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254',
])

export async function registerEndpoint(
  env: Bindings,
  origin: string,
  input: RegisterEndpointInput,
): Promise<RegisterEndpointResult> {
  const originUrl = validateOriginUrl(input.baseUrl ?? input.originUrl ?? '')
  const routePricesAtomic = normalizeRoutePrices(input)
  const fallbackPriceAtomic = !routePricesAtomic && input.priceUsdc ? normalizePrice(input.priceUsdc) : null
  if (!routePricesAtomic && !fallbackPriceAtomic) {
    throw new Error('routePricesUsdc must include at least one route price')
  }
  const destinationWallet = validateDestinationWallet(
    input.destinationWallet ?? env.PIMP_DESTINATION_WALLET,
  )
  const id = nanoid(10)
  const upstreamHeaders = normalizeUpstreamHeaders(input)

  const stored: StoredEndpoint = {
    callCount: 0,
    createdAt: Date.now(),
    destinationWallet,
    id,
    originUrl: originUrl.toString(),
    ...(routePricesAtomic ? { routePricesAtomic } : {}),
    ...(fallbackPriceAtomic ? { priceAtomic: fallbackPriceAtomic } : {}),
    upstreamHeaders: await encryptMap(upstreamHeaders, env.PIMP_DATA_KEY),
    upstreamQuery: await encryptMap(input.upstreamQuery, env.PIMP_DATA_KEY),
  }

  await env.ENDPOINTS.put(id, JSON.stringify(stored))
  const proxiedBaseUrl = new URL(`/p/${id}`, origin).toString()
  const proxiedRoutes = Object.fromEntries(
    Object.keys(routePricesAtomic ?? { [DEFAULT_ROUTE_PATH]: stored.priceAtomic! }).map((path) => [
      path,
      buildProxiedRouteUrl(proxiedBaseUrl, path),
    ]),
  )
  return {
    id,
    proxiedBaseUrl,
    proxiedRoutes,
    proxiedUrl: proxiedBaseUrl,
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

export function matchRoutePrice(endpoint: PimpEndpoint, path: string): MatchedRoute | null {
  const normalizedPath = normalizeRoutePath(path)
  if (endpoint.routePricesAtomic && Object.keys(endpoint.routePricesAtomic).length > 0) {
    const priceAtomic = endpoint.routePricesAtomic[normalizedPath]
    if (!priceAtomic) return null
    return {
      path: normalizedPath,
      priceAtomic,
    }
  }
  if (!endpoint.priceAtomic) return null
  return {
    path: DEFAULT_ROUTE_PATH,
    priceAtomic: endpoint.priceAtomic,
  }
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

export function normalizeRoutePath(value: string) {
  if (!value) {
    throw new Error('route path must not be empty')
  }
  if (value.includes('?') || value.includes('#')) {
    throw new Error('route path must not include query strings or fragments')
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('route path must not be empty')
  }
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (normalized !== '/' && normalized.endsWith('/')) {
    return normalized.slice(0, -1)
  }
  return normalized
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
    routePricesAtomic: stored.routePricesAtomic,
    upstreamHeaders: await decryptMap(stored.upstreamHeaders, env.PIMP_DATA_KEY),
    upstreamQuery: await decryptMap(stored.upstreamQuery, env.PIMP_DATA_KEY),
  }
}

function normalizeRoutePrices(input: RegisterEndpointInput) {
  if (input.routePricesUsdc && Object.keys(input.routePricesUsdc).length > 0) {
    const normalizedEntries = Object.entries(input.routePricesUsdc).map(([path, priceUsdc]) => [
      normalizeRoutePath(path),
      normalizePrice(priceUsdc),
    ])
    return Object.fromEntries(normalizedEntries)
  }
  return null
}

function normalizeUpstreamHeaders(input: RegisterEndpointInput) {
  const headers = { ...(input.upstreamHeaders ?? {}) }
  if (input.authHeader) {
    const name = input.authHeader.name.trim()
    const value = input.authHeader.value.trim()
    if (!name || !value) {
      throw new Error('authHeader must include non-empty name and value')
    }
    headers[name] = value
  }
  return headers
}

function buildProxiedRouteUrl(proxiedBaseUrl: string, path: string) {
  if (path === DEFAULT_ROUTE_PATH) return proxiedBaseUrl
  return `${proxiedBaseUrl}${path}`
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
