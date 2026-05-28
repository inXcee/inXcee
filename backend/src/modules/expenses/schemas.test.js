import { describe, it, expect } from 'vitest'
import { createExpenseSchema } from './schemas.js'

const base = { category: 'food', description: 'Market', amount: 100, expense_date: '2026-05-15' }

describe('createExpenseSchema', () => {
  it('geçerli gider kabul edilir, amount coerce edilir', () => {
    const r = createExpenseSchema.safeParse({ ...base, amount: '250.5' })
    expect(r.success).toBe(true)
    expect(r.data.amount).toBe(250.5)
  })

  it('geçersiz kategori reddedilir', () => {
    expect(createExpenseSchema.safeParse({ ...base, category: 'xxx' }).success).toBe(false)
  })

  it('negatif tutar reddedilir', () => {
    expect(createExpenseSchema.safeParse({ ...base, amount: -10 }).success).toBe(false)
  })

  it('aşırı büyük tutar reddedilir (DoS/yanlış giriş)', () => {
    expect(createExpenseSchema.safeParse({ ...base, amount: 1e12 }).success).toBe(false)
  })

  it('hatalı tarih formatı reddedilir', () => {
    expect(createExpenseSchema.safeParse({ ...base, expense_date: '15/05/2026' }).success).toBe(false)
  })

  it('çok uzun açıklama reddedilir', () => {
    expect(createExpenseSchema.safeParse({ ...base, description: 'x'.repeat(501) }).success).toBe(false)
  })
})
