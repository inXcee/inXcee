import { describe, it, expect } from 'vitest'
import { reorderStaff, mergeVisibleOrder } from './staffOrder.js'

describe('İsim sırasını sürükleme', () => {
  const IDS = [1, 2, 3, 4, 5]

  it('yukarı taşır', () => {
    expect(reorderStaff(IDS, 4, 2)).toEqual([1, 4, 2, 3, 5])
  })

  it('aşağı taşır', () => {
    expect(reorderStaff(IDS, 2, 4)).toEqual([1, 3, 4, 2, 5])
  })

  it('en başa taşır', () => {
    expect(reorderStaff(IDS, 5, 1)).toEqual([5, 1, 2, 3, 4])
  })

  // Kazara tıklama listeyi oynatmasın.
  it('aynı yere bırakma sırayı değiştirmez', () => {
    expect(reorderStaff(IDS, 3, 3)).toEqual(IDS)
  })

  it('listede olmayan id sırayı bozmaz', () => {
    expect(reorderStaff(IDS, 99, 2)).toEqual(IDS)
    expect(reorderStaff(IDS, 2, 99)).toEqual(IDS)
  })

  it('eksik girdide patlamaz', () => {
    expect(reorderStaff([], 1, 2)).toEqual([])
    expect(reorderStaff(undefined, 1, 2)).toEqual([])
    expect(reorderStaff(IDS, null, 2)).toEqual(IDS)
  })

  it('kaynak listeyi bozmaz', () => {
    const kopya = [...IDS]
    reorderStaff(IDS, 4, 1)
    expect(IDS).toEqual(kopya)
  })
})

describe('Süzülmüş listede sürükleme', () => {
  // Asıl tuzak: departman süzgeci açıkken sürüklenen sıra tüm personele
  // yazılırsa, görünmeyenler listenin sonuna savrulur.
  it('görünmeyenler kendi yerinde kalır', () => {
    const hepsi = [1, 2, 3, 4, 5, 6]
    const gorunen = [4, 2] // 2 ve 4 görünüyordu, kullanıcı 4'ü öne aldı
    expect(mergeVisibleOrder(hepsi, gorunen)).toEqual([1, 4, 3, 2, 5, 6])
  })

  it('hepsi görünüyorsa sıra aynen uygulanır', () => {
    expect(mergeVisibleOrder([1, 2, 3], [3, 1, 2])).toEqual([3, 1, 2])
  })

  it('boş görünür listede hiçbir şey değişmez', () => {
    expect(mergeVisibleOrder([1, 2, 3], [])).toEqual([1, 2, 3])
  })
})
