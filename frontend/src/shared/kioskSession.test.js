import { describe, it, expect, beforeEach } from 'vitest'
import { readKioskSession, writeKioskSession, clearKioskSession } from './kioskSession.js'

const KEY = 'test-kiosk-session'

describe('kioskSession', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('yazılan oturumu geri okur', () => {
    writeKioskSession(KEY, { token: 'abc', worker: { full_name: 'Ayşe' } })
    expect(readKioskSession(KEY)).toEqual({ token: 'abc', worker: { full_name: 'Ayşe' } })
  })

  it('cihaz yeniden başlasa da oturum kalır (localStorage)', () => {
    writeKioskSession(KEY, { token: 'abc' })
    window.sessionStorage.clear() // sekme kapandı
    expect(readKioskSession(KEY)?.token).toBe('abc')
  })

  it('eski sessionStorage oturumunu taşır ve kopyayı bırakmaz', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ token: 'eski' }))
    expect(readKioskSession(KEY)?.token).toBe('eski')
    expect(JSON.parse(window.localStorage.getItem(KEY)).token).toBe('eski')
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('çıkışta her iki depodan da silinir', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ token: 'eski' }))
    writeKioskSession(KEY, { token: 'abc' })
    clearKioskSession(KEY)
    expect(readKioskSession(KEY)).toBeNull()
  })

  it('token yoksa oturum sayılmaz', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ worker: { full_name: 'Ayşe' } }))
    expect(readKioskSession(KEY)).toBeNull()
  })

  it('bozuk JSON çökmeye yol açmaz', () => {
    window.localStorage.setItem(KEY, '{bozuk')
    expect(readKioskSession(KEY)).toBeNull()
  })
})
