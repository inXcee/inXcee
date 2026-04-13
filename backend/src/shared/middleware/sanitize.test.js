import { describe, it, expect, vi } from 'vitest'
import { sanitizeBody } from './sanitize.js'

function runMiddleware(body) {
  const req = { body }
  const res = {}
  let called = false
  sanitizeBody(req, res, () => { called = true })
  return { body: req.body, called }
}

describe('sanitizeBody', () => {
  it('HTML tag\'lerini temizler', () => {
    const { body } = runMiddleware({ description: '<script>alert(1)</script>Açıklama' })
    expect(body.description).toBe('Açıklama')
    expect(body.description).not.toContain('<script>')
  })

  it('base64 imza alanlarına dokunmaz', () => {
    const sig = 'data:image/png;base64,iVBORw0KGgo='
    const { body } = runMiddleware({ digital_signature: sig })
    expect(body.digital_signature).toBe(sig)
  })

  it('tüm imza/binary alanlarını korur', () => {
    const fields = [
      'digital_signature', 'photo_url', 'photo_before',
      'signature_data', 'occupant_signature', 'intake_signature',
      'photo_after', 'damage_photo'
    ]
    const value = 'data:image/png;base64,abc123='
    const input = Object.fromEntries(fields.map(f => [f, value]))
    const { body } = runMiddleware(input)
    fields.forEach(f => expect(body[f]).toBe(value))
  })

  it('iç içe objeleri temizler', () => {
    const { body } = runMiddleware({ meta: { title: '<b>Başlık</b>' } })
    expect(body.meta.title).toBe('Başlık')
  })

  it('dizi içindeki string\'leri temizler', () => {
    const { body } = runMiddleware({ tags: ['<script>xss</script>normal'] })
    expect(body.tags[0]).toBe('normal')
  })

  it('next() çağrılır', () => {
    const { called } = runMiddleware({ x: 'test' })
    expect(called).toBe(true)
  })

  // Legacy tests for backward compatibility
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
    expect(req.body[0].color).toBe('')
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
    expect(req.body[0].field).toBe('clean')
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
