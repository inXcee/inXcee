import { describe, it, expect } from 'vitest'
import { orderPeopleByLocation } from './dayDetail.js'

const kisi = (full_name, work_location_name, extra = {}) => ({ full_name, work_location_name, ...extra })

describe('vardiya içinde noktaya göre sıralama', () => {
  it('aynı noktadakiler yan yana gelir', () => {
    const sirali = orderPeopleByLocation([
      kisi('Ferda', 'OTC Yemekhane'),
      kisi('Gizem', 'Tas Bina'),
      kisi('Cansu', 'OTC Yemekhane'),
    ])
    expect(sirali.map(p => p.work_location_name)).toEqual(['OTC Yemekhane', 'OTC Yemekhane', 'Tas Bina'])
  })

  it('nokta içinde isim alfabetik (Türkçe)', () => {
    const sirali = orderPeopleByLocation([
      kisi('Zehra', 'OTC'), kisi('Çiğdem', 'OTC'), kisi('Ali', 'OTC'),
    ])
    expect(sirali.map(p => p.full_name)).toEqual(['Ali', 'Çiğdem', 'Zehra'])
  })

  // Noktası girilmemiş kişi listeden DÜŞMEMELİ: gizlersek o kişi sahada
  // değilmiş gibi görünür. Sona alınır ki eksik veri göze çarpsın.
  it('noktasızlar sona düşer ama kaybolmaz', () => {
    const sirali = orderPeopleByLocation([
      kisi('Yeliz', null), kisi('Ali', 'OTC'), kisi('Veli', ''),
    ])
    expect(sirali).toHaveLength(3)
    expect(sirali[0].full_name).toBe('Ali')
    expect(sirali.slice(1).map(p => p.full_name).sort()).toEqual(['Veli', 'Yeliz'])
  })

  it('çok noktalı kişi (parçalı vardiya) tek anahtarla gruplanır', () => {
    const sirali = orderPeopleByLocation([
      kisi('Bora', null, { work_locations: ['Tas Bina', 'OTC'] }),
      kisi('Ada', null, { work_locations: ['OTC', 'Tas Bina'] }),
    ])
    // Aynı iki nokta, farklı sırada verilmiş — aynı gruba düşmeli
    expect(sirali.map(p => p.full_name)).toEqual(['Ada', 'Bora'])
  })

  it('girdiyi değiştirmez, boş listede patlamaz', () => {
    const girdi = [kisi('Ali', 'B'), kisi('Veli', 'A')]
    orderPeopleByLocation(girdi)
    expect(girdi[0].full_name).toBe('Ali')
    expect(orderPeopleByLocation([])).toEqual([])
    expect(orderPeopleByLocation(undefined)).toEqual([])
  })
})
