import type { Bindings, MppService } from './types.js'
import { parseOptionalPositiveInteger, parseOptionalUrl } from './config.js'
import { logStage, logSuccess, logWarn } from './log.js'

const GATEWAY_CACHE_KEY = 'gateway:services:v1'
const DEFAULT_GATEWAY_CACHE_TTL_SECONDS = 3600
const DEFAULT_REGISTRY_URL = 'https://mpp.dev/api/services'

export async function handleGateway(request: Request, env: Bindings) {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/gateway/services') {
    try {
      logStage('GATEWAY', 'services directory requested')
      return json(await getGatewayServices(env))
    } catch (error) {
      logWarn('GATEWAY', `service registry unavailable for /gateway/services error=${formatError(error)}`)
      return json({ error: 'service registry unavailable' }, 502)
    }
  }

  if (request.method === 'GET' && url.pathname === '/gateway/services/llms.txt') {
    try {
      logStage('GATEWAY', 'llms.txt directory requested')
      const services = await getGatewayServices(env)
      return new Response(formatLlmsDirectory(services, url.origin), {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
        },
      })
    } catch (error) {
      logWarn(
        'GATEWAY',
        `service registry unavailable for /gateway/services/llms.txt error=${formatError(error)}`,
      )
      return json({ error: 'service registry unavailable' }, 502)
    }
  }

  if (url.pathname.startsWith('/g/')) {
    try {
      return await proxyGatewayRequest(request, env)
    } catch (error) {
      logWarn(
        'GATEWAY',
        `service registry unavailable for ${request.method} ${url.pathname} error=${formatError(error)}`,
      )
      return json({ error: 'service registry unavailable' }, 502)
    }
  }

  return json({ error: 'not found' }, 404)
}

export async function getGatewayServices(env: Bindings): Promise<MppService[]> {
  const cached = await env.GATEWAY_CACHE.get(getGatewayCacheKey(env))
  if (cached) {
    return parseCachedServices(cached)
  }

  return refreshGatewayServices(env)
}

export async function refreshGatewayServices(env: Bindings): Promise<MppService[]> {
  const response = await fetch(getRegistryUrl(env))
  if (!response.ok) {
    throw new Error(`registry fetch failed: ${response.status}`)
  }

  const payload = (await response.json()) as { services?: unknown }
  const services = normalizeServices(payload.services)
  await env.GATEWAY_CACHE.put(getGatewayCacheKey(env), JSON.stringify(services), {
    expirationTtl: getGatewayCacheTtlSeconds(env),
  })
  return services
}

export function getGatewayCacheKey(env: Pick<Bindings, 'GATEWAY_CACHE_KEY'>) {
  return env.GATEWAY_CACHE_KEY || GATEWAY_CACHE_KEY
}

export function getRegistryUrl(env: Pick<Bindings, 'MPP_REGISTRY_URL'>) {
  return parseOptionalUrl(env.MPP_REGISTRY_URL, 'MPP_REGISTRY_URL', DEFAULT_REGISTRY_URL)
}

export function getGatewayCacheTtlSeconds(env: Pick<Bindings, 'GATEWAY_CACHE_TTL_SECONDS'>) {
  return parseOptionalPositiveInteger(
    env.GATEWAY_CACHE_TTL_SECONDS,
    'GATEWAY_CACHE_TTL_SECONDS',
    DEFAULT_GATEWAY_CACHE_TTL_SECONDS,
  )
}

export function formatLlmsDirectory(services: MppService[], origin: string) {
  return services
    .map(
      (service) =>
        `name: ${service.name}\nserviceUrl: ${origin}/g/${service.id}\ndescription: ${service.description}`,
    )
    .join('\n\n')
}

export function buildGatewayUpstreamUrl(
  serviceUrl: string,
  suffix: string,
  incomingQuery: URLSearchParams,
) {
  const upstreamUrl = new URL(serviceUrl)
  const joinedPath = [upstreamUrl.pathname.replace(/\/$/, ''), suffix.replace(/^\//, '')]
    .filter(Boolean)
    .join('/')
  upstreamUrl.pathname = joinedPath.startsWith('/') ? joinedPath : `/${joinedPath}`

  for (const [key, value] of incomingQuery.entries()) {
    upstreamUrl.searchParams.set(key, value)
  }

  return upstreamUrl.toString()
}

async function proxyGatewayRequest(request: Request, env: Bindings) {
  const url = new URL(request.url)
  const { serviceId, suffix } = parseGatewayPath(url.pathname)
  logStage(
    'GATEWAY',
    `request service=${serviceId} method=${request.method} path=${suffix || '/'} query=${url.search || '-'}`,
  )
  const services = await getGatewayServices(env)
  const service = services.find((entry) => entry.id === serviceId)

  if (!service) {
    logWarn('GATEWAY', `service missing id=${serviceId}`)
    return json({ error: 'service not found' }, 404)
  }

  const upstreamUrl = buildGatewayUpstreamUrl(service.serviceUrl, suffix, url.searchParams)
  const upstreamInit: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: new Headers(request.headers),
    body: request.body,
    redirect: 'manual',
  }
  if (request.body) {
    upstreamInit.duplex = 'half'
  }
  const upstreamRequest = new Request(upstreamUrl, upstreamInit)
  logStage('GATEWAY_PROXY', `forward service=${serviceId} upstream=${upstreamUrl}`)
  const upstreamResponse = await fetch(upstreamRequest)
  if (upstreamResponse.status === 404) {
    logWarn('GATEWAY_PROXY', `upstream 404 service=${serviceId} upstream=${upstreamUrl}`)
  } else if (upstreamResponse.status === 402) {
    logStage('GATEWAY_PROXY', `upstream 402 passthrough service=${serviceId}`)
  } else {
    logSuccess(
      'GATEWAY_PROXY',
      `status=${upstreamResponse.status} service=${serviceId} upstream=${upstreamUrl}`,
    )
  }
  return upstreamResponse
}

function parseGatewayPath(pathname: string) {
  const trimmed = pathname.slice('/g/'.length)
  const slashIndex = trimmed.indexOf('/')

  if (slashIndex === -1) {
    return {
      serviceId: trimmed,
      suffix: '/',
    }
  }

  return {
    serviceId: trimmed.slice(0, slashIndex),
    suffix: trimmed.slice(slashIndex) || '/',
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function normalizeServices(value: unknown): MppService[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid registry payload')
  }

  return value.map((entry) => normalizeService(entry))
}

function normalizeService(value: unknown): MppService {
  if (!value || typeof value !== 'object') {
    throw new Error('invalid service entry')
  }

  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    typeof candidate.serviceUrl !== 'string' ||
    typeof candidate.description !== 'string' ||
    !Array.isArray(candidate.categories) ||
    !candidate.categories.every((category) => typeof category === 'string')
  ) {
    throw new Error('invalid service entry')
  }

  return {
    id: candidate.id,
    name: candidate.name,
    serviceUrl: candidate.serviceUrl,
    description: candidate.description,
    categories: candidate.categories,
  }
}

function parseCachedServices(raw: string) {
  return normalizeServices(JSON.parse(raw) as unknown)
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  })
}
