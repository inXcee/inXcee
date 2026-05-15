import { describe, it, expect } from 'vitest'
import { validatePassword, passwordStrength, PASSWORD_POLICY } from './password-policy.js'

describe('validatePassword', () => {
  it('boş şifreyi reddeder', () => {
    const r = validatePassword('')
    expect(r.ok).toBe(false)
    expect(r.errors).toContain('Şifre gerekli')
  })

  it('null şifreyi reddeder', () => {
    const r = validatePassword(null)
    expect(r.ok).toBe(false)
  })

  it('kısa şifreyi reddeder', () => {
    const r = validatePassword('Ab1cd')
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.includes('en az'))).toBe(true)
  })

  it('küçük harf yoksa reddeder', () => {
    const r = validatePassword('ABCDEFGH123')
    expect(r.ok).toBe(false)
    expect(r.errors).toContain('En az bir küçük harf içermeli')
  })

  it('büyük harf yoksa reddeder', () => {
    const r = validatePassword('abcdefgh123')
    expect(r.ok).toBe(false)
    expect(r.errors).toContain('En az bir büyük harf içermeli')
  })

  it('rakam yoksa reddeder', () => {
    const r = validatePassword('AbcdefghIJ')
    expect(r.ok).toBe(false)
    expect(r.errors).toContain('En az bir rakam içermeli')
  })

  it('yaygın şifreyi reddeder', () => {
    const r = validatePassword('Admin1234!')
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.includes('yaygın'))).toBe(true)
  })

  it('kullanıcı adını içeren şifreyi reddeder', () => {
    const r = validatePassword('Berkay123A', { username: 'berkay' })
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.includes('kullanıcı adı'))).toBe(true)
  })

  it('Türkçe karakterli geçerli şifreyi kabul eder', () => {
    const r = validatePassword('Şükrü1234ğ')
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('güçlü şifreyi kabul eder', () => {
    const r = validatePassword('Karanfil2026!')
    expect(r.ok).toBe(true)
  })
})

describe('passwordStrength', () => {
  it('boş için skor 0', () => {
    expect(passwordStrength('').score).toBe(0)
  })

  it('uzun + karışık + özel karakter en yüksek skor', () => {
    const s = passwordStrength('Karanfil2026!Uzun')
    expect(s.score).toBeGreaterThanOrEqual(5)
  })

  it('sadece harf orta-zayıf', () => {
    const s = passwordStrength('abcdefghij')
    expect(s.score).toBeLessThanOrEqual(2)
  })
})

describe('PASSWORD_POLICY', () => {
  it('minLength en az 10', () => {
    expect(PASSWORD_POLICY.minLength).toBeGreaterThanOrEqual(10)
  })
})
