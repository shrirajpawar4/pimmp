import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseOptionalIntegerInRange,
  parseOptionalPositiveInteger,
  parseOptionalString,
} from '../src/config.js'

describe('parseOptionalPositiveInteger', () => {
  it('uses the default for missing and empty values', () => {
    assert.equal(parseOptionalPositiveInteger(undefined, 'TEST_TTL', 300), 300)
    assert.equal(parseOptionalPositiveInteger('', 'TEST_TTL', 300), 300)
  })

  it('accepts valid positive integers', () => {
    assert.equal(parseOptionalPositiveInteger('1', 'TEST_TTL', 300), 1)
    assert.equal(parseOptionalPositiveInteger('86400', 'TEST_TTL', 300), 86400)
  })

  it('rejects zero, negative, decimal, and non-numeric values', () => {
    for (const value of ['0', '-1', '1.5', 'abc']) {
      assert.throws(
        () => parseOptionalPositiveInteger(value, 'TEST_TTL', 300),
        /TEST_TTL must be a positive integer/,
      )
    }
  })
})

describe('parseOptionalIntegerInRange', () => {
  it('accepts values inside the configured range', () => {
    assert.equal(parseOptionalIntegerInRange(undefined, 'TEST_LENGTH', 10, 6, 64), 10)
    assert.equal(parseOptionalIntegerInRange('12', 'TEST_LENGTH', 10, 6, 64), 12)
  })

  it('rejects values outside the configured range', () => {
    assert.throws(
      () => parseOptionalIntegerInRange('5', 'TEST_LENGTH', 10, 6, 64),
      /TEST_LENGTH must be between 6 and 64/,
    )
    assert.throws(
      () => parseOptionalIntegerInRange('65', 'TEST_LENGTH', 10, 6, 64),
      /TEST_LENGTH must be between 6 and 64/,
    )
  })
})

describe('parseOptionalString', () => {
  it('uses defaults only for missing or empty values', () => {
    assert.equal(parseOptionalString(undefined, 'default'), 'default')
    assert.equal(parseOptionalString('', 'default'), 'default')
    assert.equal(parseOptionalString('configured', 'default'), 'configured')
  })
})
