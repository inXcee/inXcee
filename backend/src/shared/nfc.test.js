import { describe, it, expect } from 'vitest'
import { normalizeNfcUid } from './nfc.js'

describe('normalizeNfcUid', () => {
  it('uppercases and strips colons/spaces/dashes/dots', () => {
    expect(normalizeNfcUid('04:1a:2b')).toBe('041A2B')
    expect(normalizeNfcUid('04 1a 2b')).toBe('041A2B')
    expect(normalizeNfcUid('04-1a-2b')).toBe('041A2B')
    expect(normalizeNfcUid('04.1a.2b')).toBe('041A2B')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeNfcUid('  041A2B  ')).toBe('041A2B')
  })

  it('is idempotent on an already-canonical UID', () => {
    expect(normalizeNfcUid('041A2B')).toBe('041A2B')
  })

  it('returns null for empty / null / whitespace', () => {
    expect(normalizeNfcUid('')).toBeNull()
    expect(normalizeNfcUid(null)).toBeNull()
    expect(normalizeNfcUid(undefined)).toBeNull()
    expect(normalizeNfcUid('   ')).toBeNull()
  })
})
