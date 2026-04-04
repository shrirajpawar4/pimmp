import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseRegisterArgs } from '../packages/pimpp-cli/src/cli.js'

describe('parseRegisterArgs', () => {
  it('expands the openai template with a shared price', () => {
    const parsed = parseRegisterArgs([
      'https://pimpp.fun',
      'https://api.openai.com/v1',
      '--template',
      'openai',
      '--price',
      '0.01',
      '--auth-header',
      'authorization=Bearer secret',
    ])

    assert.deepEqual(parsed.routePricesUsdc, {
      '/chat/completions': '0.01',
      '/embeddings': '0.01',
      '/responses': '0.01',
    })
    assert.deepEqual(parsed.authHeader, {
      name: 'authorization',
      value: 'Bearer secret',
    })
  })

  it('allows explicit route overrides on top of a template', () => {
    const parsed = parseRegisterArgs([
      'https://pimpp.fun',
      'https://api.github.com',
      '--template',
      'github-rest',
      '--price',
      '0.01',
      '--route',
      '/search/issues=0.05',
    ])

    assert.equal(parsed.routePricesUsdc['/user'], '0.01')
    assert.equal(parsed.routePricesUsdc['/search/repositories'], '0.01')
    assert.equal(parsed.routePricesUsdc['/search/issues'], '0.05')
  })

  it('rejects unknown templates', () => {
    assert.throws(() =>
      parseRegisterArgs([
        'https://pimpp.fun',
        'https://api.example.com',
        '--template',
        'notion',
        '--price',
        '0.01',
      ]),
    )
  })

  it('rejects registrations without any route pricing', () => {
    assert.throws(() =>
      parseRegisterArgs(['https://pimpp.fun', 'https://api.example.com']),
    )
  })
})
