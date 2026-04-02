import { Hono } from 'hono'

import { getEndpoint, registerEndpoint } from './registry.js'
import { logDivider, logStage, logSuccess } from './log.js'
import { handleProxyRequest } from './proxy.js'
import type { Bindings, RegisterEndpointInput } from './types.js'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c) => c.env.ASSETS.fetch(new URL('/index.html', c.req.url)))

app.get('/.well-known/payment', (c) =>
  c.json({
    intent: 'charge',
    method: 'usdc-base',
    network: 'base',
    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  }),
)

app.post('/register', async (c) => {
  const body = (await c.req.json()) as RegisterEndpointInput
  try {
    const registered = await registerEndpoint(c.env, c.req.url, body)
    logDivider('endpoint registered')
    logSuccess('REGISTER', `id=${registered.id} url=${registered.proxiedUrl}`)
    return c.json({
      ...registered,
      instructions: 'Call the proxied URL. Unpaid requests receive a 402 MPP challenge.',
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
    priceAtomic: endpoint.priceAtomic,
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
