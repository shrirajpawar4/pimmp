import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildUpstreamUrl } from '../src/proxy.js'

describe('buildUpstreamUrl', () => {
  it('joins base paths and merges query params', () => {
    const url = buildUpstreamUrl(
      'https://api.example.com/data/v1?fixed=yes',
      '/weather',
      new URLSearchParams('q=London'),
      { api_key: 'secret' },
    )

    assert.equal(
      url,
      'https://api.example.com/data/v1/weather?fixed=yes&api_key=secret&q=London',
    )
  })

  it('preserves root-style origins cleanly', () => {
    const url = buildUpstreamUrl(
      'https://api.example.com',
      '/status',
      new URLSearchParams(),
      {},
    )

    assert.equal(url, 'https://api.example.com/status')
  })
})
