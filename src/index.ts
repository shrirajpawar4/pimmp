import { Hono } from 'hono'

import { handleGateway } from './gateway.js'
import { getEndpoint, registerEndpoint } from './registry.js'
import { logDivider, logStage, logSuccess } from './log.js'
import { handleProxyRequest } from './proxy.js'
import { getProxyTemplates } from './templates/index.js'
import type { Bindings, RegisterEndpointInput } from './types.js'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) =>
  c.json({
    name: 'pimpp',
    description: 'Transparent MPP payment proxy for HTTP APIs using USDC on Base.',
    endpoints: {
      paymentMethod: '/.well-known/payment',
      register: '/register',
      proxy: '/p/:id/*',
      status: '/p/:id/status',
      templates: '/templates',
    },
  }),
)

app.get('/templates', (c) =>
  c.json({
    templates: getProxyTemplates(),
  }),
)

app.get('/.well-known/payment', (c) =>
  c.json({
    intent: 'charge',
    method: 'usdc-base',
    network: 'base',
    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  }),
)

app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/gateway/') || c.req.path.startsWith('/g/')) {
    return handleGateway(c.req.raw, c.env)
  }
  await next()
})

app.post('/register', async (c) => {
  const body = (await c.req.json()) as RegisterEndpointInput
  try {
    const registered = await registerEndpoint(c.env, c.req.url, body)
    logDivider('endpoint registered')
    logSuccess('REGISTER', `id=${registered.id} url=${registered.proxiedBaseUrl}`)
    return c.json({
      ...registered,
      instructions: 'Call one of the proxied URLs. Unpaid requests receive a 402 MPP challenge.',
    })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'registration failed' },
      400,
    )
  }
})

app.get('/p/:id/status', async (c) => {
  const endpoint = await getEndpoint(c.env, c.req.param('id'))
  if (!endpoint) return c.json({ error: 'not found' }, 404)
  logStage('STATUS', `id=${endpoint.id} calls=${endpoint.callCount}`)
  return c.json({
    callCount: endpoint.callCount,
    createdAt: endpoint.createdAt,
    originHost: new URL(endpoint.originUrl).host,
    ...(endpoint.routePricesAtomic
      ? { routePricesAtomic: endpoint.routePricesAtomic }
      : { priceAtomic: endpoint.priceAtomic }),
  })
})

app.all('/p/:id/*', async (c) => {
  const endpoint = await getEndpoint(c.env, c.req.param('id'))
  if (!endpoint) return c.json({ error: 'not found' }, 404)
  const suffix = c.req.path.replace(`/p/${endpoint.id}`, '')
  logDivider('incoming request')
  logStage(
    'REQUEST',
    `id=${endpoint.id} method=${c.req.method} path=${suffix || '/'} query=${new URL(c.req.url).search || '-'}`,
  )
  return handleProxyRequest(c.req.raw, c.env, endpoint, suffix)
})

export default app
