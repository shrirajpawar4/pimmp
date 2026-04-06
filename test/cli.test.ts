import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseRegisterArgs, parseRequestArgs } from '../packages/pimpp-cli/src/cli.js'

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

describe('parseRequestArgs', () => {
  it('parses a gateway POST request with headers and body', () => {
    const parsed = parseRequestArgs([
      'https://pimpp.dev/g/openai/v1/responses',
      '--method',
      'post',
      '--header',
      'content-type=application/json',
      '--header',
      'x-test=value',
      '--body',
      '{"model":"gpt-4.1-mini","input":"Say hello"}',
    ])

    assert.equal(parsed.url, 'https://pimpp.dev/g/openai/v1/responses')
    assert.equal(parsed.method, 'POST')
    assert.equal(parsed.headers.get('content-type'), 'application/json')
    assert.equal(parsed.headers.get('x-test'), 'value')
    assert.equal(parsed.body, '{"model":"gpt-4.1-mini","input":"Say hello"}')
  })

  it('defaults to POST when a body is provided without an explicit method', () => {
    const parsed = parseRequestArgs([
      'https://pimpp.dev/g/openai/v1/responses',
      '--body',
      '{"model":"gpt-4.1-mini","input":"Say hello"}',
    ])

    assert.equal(parsed.method, 'POST')
  })
})
