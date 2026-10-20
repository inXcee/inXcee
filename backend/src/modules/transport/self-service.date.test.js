// Personelin kiosk/telefonda gördüğü servis günü İstanbul takvimine göre.
// Gece 01:30'da (UTC'de hâlâ dün) bakan gece vardiyası DÜNÜN servisini görüyordu.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { initDB } from '../../shared/db/index.js'
import { getStaffTransport } from './self-service.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
})

afterEach(() => { vi.useRealTimers() })

describe('getStaffTransport varsayılan gün', () => {
  it('İstanbul 01:30 → bugünün tarihi (UTC dünü değil)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-18T22:30:00Z')) // 19 Eki 01:30 İstanbul
    expect(getStaffTransport(999999).date).toBe('2026-10-19')
  })

  it('verilen tarih aynen kullanılır', () => {
    expect(getStaffTransport(999999, '2026-05-01').date).toBe('2026-05-01')
  })
})
