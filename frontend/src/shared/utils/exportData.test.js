// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { safeValue } from './exportData.js'
import { buildCsvText } from '../../modules/water/logic/waterUi.js'

describe('safeValue — CSV formül enjeksiyonu', () => {
  it('formülle başlayan metni etkisizleştirir', () => {
    expect(safeValue('=HYPERLINK("http://x")')).toBe('\'=HYPERLINK("http://x")')
    expect(safeValue('+cmd|calc')).toBe("'+cmd|calc")
    expect(safeValue('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(safeValue('-2+3+cmd')).toBe("'-2+3+cmd")
  })

  it('sayı, telefon ve sıradan metne dokunmaz', () => {
    expect(safeValue(-150)).toBe('-150')
    expect(safeValue('-150,50')).toBe('-150,50')
    expect(safeValue('+90 555 123 45 67')).toBe('+90 555 123 45 67')
    expect(safeValue('Ahmet Yılmaz')).toBe('Ahmet Yılmaz')
    expect(safeValue('-')).toBe('-')
    expect(safeValue(null)).toBe('')
    expect(safeValue(0)).toBe('0')
  })

  it('su modülü CSV hücrelerine de uygulanır', () => {
    expect(buildCsvText(['Not'], [['=1+1']])).toBe('"Not"\n"\'=1+1"')
  })
})
