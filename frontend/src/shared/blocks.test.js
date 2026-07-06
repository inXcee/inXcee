import { describe, it, expect } from 'vitest'
import {
  BLOCKS,
  BLOCK_BY_NAME,
  BLOCKS_BY_TYPE,
  getBlockConfig,
  expectedRoomNos,
  getCapacity,
  getFloorLabel,
} from './blocks.js'

describe('blocks config', () => {
  it('19 blok tanimli (3 M + 3 S + 13 Y)', () => {
    expect(BLOCKS.length).toBe(19)
    expect(BLOCKS_BY_TYPE.M.length).toBe(3)
    expect(BLOCKS_BY_TYPE.S.length).toBe(3)
    expect(BLOCKS_BY_TYPE.Y.length).toBe(13)
  })

  it('BLOCK_BY_NAME tum bloklara erisim saglar', () => {
    expect(BLOCK_BY_NAME.M1?.type).toBe('M')
    expect(BLOCK_BY_NAME.S2?.type).toBe('S')
    expect(BLOCK_BY_NAME.A?.type).toBe('Y')
    expect(BLOCK_BY_NAME.C?.type).toBe('Y')
    expect(BLOCK_BY_NAME.NONEXIST).toBeUndefined()
  })

  it('expectedRoomNos M1 kat 1 → [101..130]', () => {
    expect(expectedRoomNos('M1', 1)).toEqual(Array.from({ length: 30 }, (_, i) => 101 + i))
  })

  it('expectedRoomNos H kat 1 → [1..20] (100lu degil)', () => {
    expect(expectedRoomNos('H', 1)).toEqual(Array.from({ length: 20 }, (_, i) => 1 + i))
  })

  it('expectedRoomNos E kat 3 → [301..320]', () => {
    expect(expectedRoomNos('E', 3)).toEqual(Array.from({ length: 20 }, (_, i) => 301 + i))
  })

  it('expectedRoomNos F kat 3 → [301..310]', () => {
    expect(expectedRoomNos('F', 3)).toEqual(Array.from({ length: 10 }, (_, i) => 301 + i))
  })

  it('expectedRoomNos D kat 2 → [] (D tek katli)', () => {
    expect(expectedRoomNos('D', 2)).toEqual([])
  })

  it('expectedRoomNos bilinmeyen blok → []', () => {
    expect(expectedRoomNos('XX', 1)).toEqual([])
  })

  it('getCapacity S2 kat 2 → 4 (istisna)', () => {
    expect(getCapacity('S2', 2)).toBe(4)
  })

  it('getCapacity S2 kat 1 → 6 (varsayilan)', () => {
    expect(getCapacity('S2', 1)).toBe(6)
  })

  it('getCapacity A kat 1 → 6 (Y blok varsayilan placeholder; bkz 595f890)', () => {
    expect(getCapacity('A', 1)).toBe(6)
  })

  it('getCapacity M1 → 6', () => {
    expect(getCapacity('M1', 1)).toBe(6)
  })

  it('getFloorLabel F kat 3 → "301-310"', () => {
    expect(getFloorLabel('F', 3)).toBe('301–310')
  })

  it('getFloorLabel H kat 1 → "1-20"', () => {
    expect(getFloorLabel('H', 1)).toBe('1–20')
  })

  it('getFloorLabel D kat 2 → "" (D tek katli)', () => {
    expect(getFloorLabel('D', 2)).toBe('')
  })

  it('getBlockConfig Y bloklarinda isPlaceholder=true', () => {
    for (const yBlock of ['A', 'A1', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']) {
      expect(getBlockConfig(yBlock)?.isPlaceholder).toBe(true)
    }
    expect(getBlockConfig('M1')?.isPlaceholder).toBeUndefined()
    expect(getBlockConfig('S1')?.isPlaceholder).toBeUndefined()
  })

  it('Y bloklarinda hasPrivateBath=true', () => {
    for (const block of BLOCKS_BY_TYPE.Y) {
      expect(getBlockConfig(block)?.hasPrivateBath).toBe(true)
    }
  })

  it('M bloklarinda hasPrivateBath=false', () => {
    for (const block of BLOCKS_BY_TYPE.M) {
      expect(getBlockConfig(block)?.hasPrivateBath).toBe(false)
    }
  })
})
