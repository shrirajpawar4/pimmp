import type { ProxyTemplate } from './types.js'

export const githubRestTemplate: ProxyTemplate = {
  authHeaderName: 'authorization',
  baseUrlExample: 'https://api.github.com',
  description:
    'Wrap familiar GitHub REST routes like /user, /search/repositories, and /search/issues.',
  id: 'github-rest',
  label: 'GitHub REST Proxy',
  routes: ['/user', '/search/issues', '/search/repositories'],
}
