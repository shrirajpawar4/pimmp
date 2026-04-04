import { githubRestTemplate } from './github-rest.js'
import { openaiTemplate } from './openai.js'

export type { ProxyTemplate } from './types.js'

const PROXY_TEMPLATES = [openaiTemplate, githubRestTemplate]

export function getProxyTemplates() {
  return PROXY_TEMPLATES.map((template) => ({
    ...template,
    routes: [...template.routes],
  }))
}

export function getProxyTemplate(id: string) {
  return PROXY_TEMPLATES.find((template) => template.id === id)
}

export function isProxyTemplateId(value: string): value is (typeof PROXY_TEMPLATES)[number]['id'] {
  return PROXY_TEMPLATES.some((template) => template.id === value)
}
