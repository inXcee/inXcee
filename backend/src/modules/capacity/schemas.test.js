import { describe, it, expect } from 'vitest'
import { bulkAssignSchema, bulkRoomStatusSchema, swapSchema } from './schemas.js'

describe('capacity schemas', () => {
  it('bulkAssign: geçerli giriş coerce eder', () => {
    const r = bulkAssignSchema.safeParse({ personnel_ids: ['1', 2, '3'], room_id: '5' })
    expect(r.success).toBe(true)
    expect(r.data.personnel_ids).toEqual([1, 2, 3])
    expect(r.data.room_id).toBe(5)
  })

  it('bulkAssign: boş dizi reddedilir', () => {
    expect(bulkAssignSchema.safeParse({ personnel_ids: [], room_id: 1 }).success).toBe(false)
  })

  it('bulkAssign: negatif/sıfır id reddedilir', () => {
    expect(bulkAssignSchema.safeParse({ personnel_ids: [1, -2], room_id: 1 }).success).toBe(false)
    expect(bulkAssignSchema.safeParse({ personnel_ids: [0], room_id: 1 }).success).toBe(false)
  })

  it('bulkAssign: dizi olmayan/string id reddedilir', () => {
    expect(bulkAssignSchema.safeParse({ personnel_ids: 'hepsi', room_id: 1 }).success).toBe(false)
    expect(bulkAssignSchema.safeParse({ personnel_ids: ['abc'], room_id: 1 }).success).toBe(false)
  })

  it('bulkRoomStatus: geçersiz durum reddedilir', () => {
    expect(bulkRoomStatusSchema.safeParse({ room_ids: [1], status: 'silinmis' }).success).toBe(false)
    expect(bulkRoomStatusSchema.safeParse({ room_ids: [1], status: 'quarantine' }).success).toBe(true)
  })

  it('swap: iki id zorunlu', () => {
    expect(swapSchema.safeParse({ person_a_id: 1 }).success).toBe(false)
    expect(swapSchema.safeParse({ person_a_id: 1, person_b_id: 2 }).success).toBe(true)
  })
})
