import type { Bindings, MppService } from './types.js'
import { logStage, logSuccess, logWarn } from './log.js'

const GATEWAY_CACHE_KEY = 'gateway:services:v1'
const GATEWAY_CACHE_TTL_SECONDS = 3600
const REGISTRY_URL = 'https://mpp.dev/api/services'

export async function handleGateway(request: Request, env: Bindings) {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/gateway/services') {
    try {
      logStage('GATEWAY', 'services directory requested')
      return json(await getGatewayServices(env))
    } catch {
      logWarn('GATEWAY', 'service registry unavailable for /gateway/services')
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
    } catch {
      logWarn('GATEWAY', 'service registry unavailable for /gateway/services/llms.txt')
      return json({ error: 'service registry unavailable' }, 502)
    }
  }

  if (url.pathname.startsWith('/g/')) {
    try {
      return await proxyGatewayRequest(request, env)
    } catch {
      logWarn('GATEWAY', `service registry unavailable for ${request.method} ${url.pathname}`)
      return json({ error: 'service registry unavailable' }, 502)
    }
  }

  return json({ error: 'not found' }, 404)
}

export async function getGatewayServices(env: Bindings): Promise<MppService[]> {
  const cached = await env.GATEWAY_CACHE.get(GATEWAY_CACHE_KEY)
  if (cached) {
    return parseCachedServices(cached)
  }

  return refreshGatewayServices(env)
}

export async function refreshGatewayServices(env: Bindings): Promise<MppService[]> {
  const response = await fetch(REGISTRY_URL)
  if (!response.ok) {
    throw new Error(`registry fetch failed: ${response.status}`)
  }

  const payload = (await response.json()) as { services?: unknown }
  const services = normalizeServices(payload.services)
  await env.GATEWAY_CACHE.put(GATEWAY_CACHE_KEY, JSON.stringify(services), {
    expirationTtl: GATEWAY_CACHE_TTL_SECONDS,
  })
  return services
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
