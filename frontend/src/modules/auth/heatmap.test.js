import { describe, it, expect } from 'vitest'
import { occupancyColor } from './heatmap.js'

describe('occupancyColor', () => {
  it('düşük doluluk yeşil (<60)', () => expect(occupancyColor(45)).toBe('#1fa971'))
  it('orta doluluk sarı (60–79)', () => expect(occupancyColor(70)).toBe('#d6a020'))
  it('yüksek doluluk kırmızı (>=80)', () => expect(occupancyColor(92)).toBe('#d6453f'))
  it('sınır 60 sarı', () => expect(occupancyColor(60)).toBe('#d6a020'))
  it('sınır 80 kırmızı', () => expect(occupancyColor(80)).toBe('#d6453f'))
  it('null/undefined nötr gri', () => expect(occupancyColor(null)).toBe('#41576b'))
})
