import type { ProxyTemplate } from './types.js'

export const openaiTemplate: ProxyTemplate = {
  authHeaderName: 'authorization',
  baseUrlExample: 'https://api.openai.com/v1',
  description:
    'Wrap OpenAI-compatible routes like /responses, /chat/completions, and /embeddings with per-route pricing.',
  id: 'openai',
  label: 'OpenAI-Compatible Proxy',
  routes: ['/chat/completions', '/embeddings', '/responses'],
}
