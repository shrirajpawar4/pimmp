import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getAddress } from 'viem'

import { normalizePrice, validateDestinationWallet, validateOriginUrl } from '../src/registry.js'

describe('registry validation', () => {
  it('normalizes decimal USDC prices to atomic units', () => {
    assert.equal(normalizePrice('0.01'), '10000')
    assert.equal(normalizePrice('1'), '1000000')
  })

  it('rejects blocked origin hosts', () => {
    assert.throws(() => validateOriginUrl('http://127.0.0.1:3000'))
    assert.throws(() => validateOriginUrl('http://192.168.1.10/api'))
  })

  it('accepts valid origins and checksum-normalizes wallets', () => {
    const url = validateOriginUrl('https://api.example.com/v1')
    assert.equal(url.hostname, 'api.example.com')
    assert.equal(
      validateDestinationWallet('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
      getAddress('0x742d35cc6634c0532925a3b844bc9e7595f8fe00'),
    )
  })
})
