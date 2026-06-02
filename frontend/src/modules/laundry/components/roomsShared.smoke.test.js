import { describe, it, expect } from 'vitest'
import { STATUS_LABEL, STATUS_COLOR, formatRelative } from './roomsShared.js'

describe('roomsShared', () => {
  it('STATUS_LABEL/STATUS_COLOR tüm durumları kapsar', () => {
    for (const k of ['dirty', 'pending_collection', 'washing', 'ironing', 'ready', 'delivered', 'lost']) {
      expect(STATUS_LABEL[k]).toBeTruthy()
      expect(STATUS_COLOR[k]).toBeTruthy()
    }
  })

  it('formatRelative boş değeri tire ile döner', () => {
    expect(formatRelative(null)).toBe('—')
    expect(formatRelative('')).toBe('—')
  })

  it('formatRelative dakika/saat/gün eşiklerini ayırt eder', () => {
    const now = Date.now()
    expect(formatRelative(new Date(now - 5 * 60 * 1000).toISOString())).toMatch(/dk önce$/)
    expect(formatRelative(new Date(now - 3 * 36e5).toISOString())).toMatch(/sa önce$/)
    expect(formatRelative(new Date(now - 5 * 24 * 36e5).toISOString())).toMatch(/g önce$/)
  })

  it('formatRelative 30 günden eskiyi tarih olarak gösterir', () => {
    const old = new Date(Date.now() - 60 * 24 * 36e5).toISOString()
    const out = formatRelative(old)
    expect(out).not.toMatch(/önce$/)
  })
})
