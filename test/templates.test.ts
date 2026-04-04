import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  getProxyTemplate,
  getProxyTemplates,
  isProxyTemplateId,
} from '../src/templates/index.js'

describe('proxy templates', () => {
  it('returns discoverable template definitions', () => {
    const templates = getProxyTemplates()
    assert.equal(templates.length, 2)
    assert.deepEqual(
      templates.map((template) => template.id),
      ['openai', 'github-rest'],
    )
    assert.equal(templates[0]?.routes.includes('/responses'), true)
  })

  it('looks up templates by id', () => {
    assert.equal(getProxyTemplate('openai')?.label, 'OpenAI-Compatible Proxy')
    assert.equal(getProxyTemplate('missing'), undefined)
  })

  it('validates template ids', () => {
    assert.equal(isProxyTemplateId('github-rest'), true)
    assert.equal(isProxyTemplateId('notion'), false)
  })
})
