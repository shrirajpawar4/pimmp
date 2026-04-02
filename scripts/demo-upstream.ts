import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'pimpp-demo-upstream',
    ts: Date.now(),
  }),
)

app.get('/tools/weather', (c) =>
  c.json({
    city: c.req.query('city') ?? 'London',
    condition: 'clear',
    source: 'demo-upstream',
    temperatureC: 24,
    ts: Date.now(),
  }),
)

app.post('/tools/summarize', async (c) => {
  const body = await c.req.json().catch(() => ({ text: '' }))
  const text = typeof body?.text === 'string' ? body.text : ''
  const summary = text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .join(' ')

  return c.json({
    source: 'demo-upstream',
    summary: summary || 'No text provided.',
    wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
  })
})

const port = Number(process.env.DEMO_UPSTREAM_PORT ?? '8788')

console.log(`[demo-upstream] listening on http://127.0.0.1:${port}`)
console.log('[demo-upstream] endpoints:')
console.log(`  GET  http://127.0.0.1:${port}/health`)
console.log(`  GET  http://127.0.0.1:${port}/tools/weather?city=London`)
console.log(`  POST http://127.0.0.1:${port}/tools/summarize`)

serve({
  fetch: app.fetch,
  port,
})
