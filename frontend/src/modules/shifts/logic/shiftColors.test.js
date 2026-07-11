import { describe, it, expect } from 'vitest'
import { classHex, shiftHex, deptHex, leaveHex, codeHex, hexToRgba } from './shiftColors.js'

describe('shiftColors — tek renk kaynağı (X1)', () => {
  it('bilinen Tailwind sınıfı doğru hex verir', () => {
    expect(classHex('bg-blue-600')).toBe('2563EB')
    expect(classHex('bg-red-600')).toBe('DC2626')
    expect(classHex('bg-orange-400')).toBe('FB923C')
    expect(shiftHex('bg-indigo-600')).toBe('4F46E5')
    expect(deptHex('bg-green-600')).toBe('16A34A')
  })

  it('bilinmeyen sınıf GRİ değil — deterministik sabit renk atanır', () => {
    const a = classHex('bg-brand-özel-42')
    expect(a).toMatch(/^[0-9A-F]{6}$/)
    expect(a).not.toBe('94A3B8') // eski sessiz gri fallback
    // aynı sınıf her zaman aynı renk
    expect(classHex('bg-brand-özel-42')).toBe(a)
  })

  it('boş/null → nötr slate', () => {
    expect(classHex(null)).toBe('64748B')
    expect(classHex('')).toBe('64748B')
  })

  it('leaveHex ve codeHex hizalı hex verir', () => {
    expect(leaveHex('annual')).toBe('14B8A6')
    expect(leaveHex('sick')).toBe('F97316')
    expect(leaveHex('bilinmeyen')).toBe('14B8A6') // varsayılan
    expect(codeHex('N')).toBe('22C55E')
    expect(codeHex('Y')).toBe('EF4444')
    expect(codeHex('yi')).toBe('3B82F6')
  })

  it('hexToRgba doğru rgba üretir (ekran dolgusu)', () => {
    expect(hexToRgba('3B82F6', 0.15)).toBe('rgba(59,130,246,0.15)')
    expect(hexToRgba('#DC2626', 1)).toBe('rgba(220,38,38,1)')
  })
})
