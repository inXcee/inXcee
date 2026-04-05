import { describe, it, expect, vi } from 'vitest'
import { sanitizeBody } from './sanitize.js'

describe('sanitizeBody', () => {
  it('passes through plain object bodies', () => {
    const req = { body: { name: 'Test', note: '<b>hello</b>' } }
    const next = vi.fn()
    sanitizeBody(req, {}, next)
    expect(req.body.name).toBe('Test')
    expect(req.body.note).toBe('hello')
    expect(next).toHaveBeenCalledOnce()
  })

  it('handles array body — preserves array structure and strips XSS tags', () => {
    const req = {
      body: [{ garment_type: 'Pantolon', color: '<script>alert(1)</script>' }],
    }
    const next = vi.fn()
    sanitizeBody(req, {}, next)
    expect(Array.isArray(req.body)).toBe(true)
    expect(req.body[0].garment_type).toBe('Pantolon')
    expect(req.body[0].color).toBe('alert(1)')
    expect(next).toHaveBeenCalledOnce()
  })

  it('strips script tags from nested string values in arrays', () => {
    const req = {
      body: [
        { field: '<script>bad()</script>clean' },
        { field: '<img src=x onerror=bad()>text' },
      ],
    }
    const next = vi.fn()
    sanitizeBody(req, {}, next)
    expect(req.body[0].field).toBe('bad()clean')
    expect(req.body[1].field).toBe('text')
  })

  it('skips sanitization when body is falsy', () => {
    const req = { body: null }
    const next = vi.fn()
    sanitizeBody(req, {}, next)
    expect(req.body).toBeNull()
    expect(next).toHaveBeenCalledOnce()
  })
})
