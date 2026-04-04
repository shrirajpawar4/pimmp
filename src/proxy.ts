import { Challenge } from 'mppx'

import { logStage, logSuccess } from './log.js'
import { incrementCallCount, matchRoutePrice, normalizeRoutePath } from './registry.js'
import { storeChallenge } from './replay.js'
import type { Bindings, PimpEndpoint } from './types.js'
import { createPaymentHandler } from './mpp.js'

export async function handleProxyRequest(
  request: Request,
  env: Bindings,
  endpoint: PimpEndpoint,
  suffix: string,
) {
  const url = new URL(request.url)
  const routePath = normalizeRoutePath(suffix || '/')
  const matchedRoute = matchRoutePrice(endpoint, routePath)
  if (!matchedRoute) {
    return new Response(JSON.stringify({ error: 'route not registered' }), {
      status: 404,
      headers: {
        'content-type': 'application/json',
      },
    })
  }
  const payment = createPaymentHandler(env, endpoint, url.host)
  const result = await payment.charge({
    amount: matchedRoute.priceAtomic,
    currency: 'usdc',
    recipient: endpoint.destinationWallet,
    description: `Proxy access for ${endpoint.id}${matchedRoute.path}`,
    methodDetails: {
      chainId: 8453,
      network: 'base',
      token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
  })(request)

  if (result.status === 402) {
    const challenge = Challenge.fromResponse(result.challenge)
    const expiresAt = challenge.expires
      ? Date.parse(challenge.expires)
      : Date.now() + 5 * 60 * 1000
    logStage(
      'CHALLENGE',
      `issued id=${endpoint.id} challenge=${challenge.id} route=${matchedRoute.path} amount=${matchedRoute.priceAtomic}`,
    )
    await storeChallenge(env, challenge.id, {
      endpointId: endpoint.id,
      expectedAmount: matchedRoute.priceAtomic,
      expectedRecipient: endpoint.destinationWallet,
      expiresAt,
      routePath: matchedRoute.path,
    })
    return result.challenge
  }

  const upstreamUrl = buildUpstreamUrl(endpoint.originUrl, suffix, url.searchParams, endpoint.upstreamQuery)
  logStage('PROXY', `forward id=${endpoint.id} upstream=${upstreamUrl}`)
  const proxyRequest = new Request(upstreamUrl, {
    body: request.body,
    headers: buildProxyHeaders(request, url.host, endpoint.upstreamHeaders),
    method: request.method,
    redirect: 'manual',
  })

  const upstreamResponse = await fetch(proxyRequest)
  await incrementCallCount(env, endpoint)
  logSuccess(
    'RESPONSE',
    `status=${upstreamResponse.status} id=${endpoint.id} route=${matchedRoute.path} upstream=${upstreamUrl}`,
  )
  return result.withReceipt(upstreamResponse)
}

export function buildUpstreamUrl(
  originUrl: string,
  suffix: string,
  incomingQuery: URLSearchParams,
  upstreamQuery: Record<string, string>,
) {
  const baseUrl = new URL(originUrl)
  const joinedPath = [baseUrl.pathname.replace(/\/$/, ''), suffix.replace(/^\//, '')]
    .filter(Boolean)
    .join('/')
  baseUrl.pathname = joinedPath.startsWith('/') ? joinedPath : `/${joinedPath}`

  for (const [key, value] of Object.entries(upstreamQuery)) {
    baseUrl.searchParams.set(key, value)
  }
  for (const [key, value] of incomingQuery.entries()) {
    baseUrl.searchParams.set(key, value)
  }
  return baseUrl.toString()
}

function buildProxyHeaders(
  request: Request,
  originalHost: string,
  upstreamHeaders: Record<string, string>,
) {
  const headers = new Headers(request.headers)
  headers.delete('authorization')
  headers.delete('host')
  headers.set('x-forwarded-host', originalHost)

  const ip = request.headers.get('cf-connecting-ip')
  if (ip) {
    headers.set('x-forwarded-for', ip)
  }

  for (const [name, value] of Object.entries(upstreamHeaders)) {
    headers.set(name, value)
  }
  return headers
}
