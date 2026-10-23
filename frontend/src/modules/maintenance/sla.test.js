import { describe, it, expect } from 'vitest'
import { isSlaOverdue } from './sla.js'

// sla_deadline sunucuda UTC yazılır ('2026-10-23 12:00:00' = İstanbul 15:00). Sayfa bunu
// `new Date(r.sla_deadline)` ile yerel saat sanıyordu: arıza 3 saat ERKEN 'geciken' görünüyordu.
describe('isSlaOverdue', () => {
  const talep = { status: 'in_progress', sla_deadline: '2026-10-23 12:00:00' }

  it('UTC süre dolmadan gecikmiş sayılmaz', () => {
    expect(isSlaOverdue(talep, new Date(Date.UTC(2026, 9, 23, 10, 0)))).toBe(false)   // İstanbul 13:00
  })

  it('UTC süre dolunca gecikmiştir', () => {
    expect(isSlaOverdue(talep, new Date(Date.UTC(2026, 9, 23, 12, 30)))).toBe(true)
  })

  it('işlemdeki arıza da gecikebilir (yalnız status=open değil)', () => {
    expect(isSlaOverdue({ ...talep, status: 'open' }, new Date(Date.UTC(2026, 9, 24)))).toBe(true)
    expect(isSlaOverdue({ ...talep, status: 'in_progress' }, new Date(Date.UTC(2026, 9, 24)))).toBe(true)
  })

  it('tamamlanan ya da SLA\'sız arıza gecikmiş sayılmaz', () => {
    expect(isSlaOverdue({ ...talep, status: 'done' }, new Date(Date.UTC(2026, 9, 24)))).toBe(false)
    expect(isSlaOverdue({ status: 'open', sla_deadline: null }, new Date(Date.UTC(2026, 9, 24)))).toBe(false)
  })
})
