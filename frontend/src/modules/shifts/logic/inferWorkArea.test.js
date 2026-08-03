import { describe, it, expect } from 'vitest'
import { inferWorkArea } from './scheduleExcelExport.js'

// Canlı şikâyet: vardiya çıktılarında herkes yemekhanede görünüyordu. Sebep,
// görev metnindeki "yemek/mutfak/aşçı" gibi geniş anahtarlar ve kişinin ADININ
// da eşleştirmeye katılmasıydı.
describe('inferWorkArea', () => {
  it('yemekhaneyle ilişkilendirilen tek grup ikram ve bulaşıkhanedir', () => {
    expect(inferWorkArea({ position: 'İkramcı' })).toBe('Yemekhane')
    expect(inferWorkArea({ dept_name: 'Bulaşıkhane' })).toBe('Yemekhane')
  })

  it('lokaller kendi adıyla görünür', () => {
    expect(inferWorkArea({ position: 'Lokal Görevlisi' })).toBe('Lokal')
  })

  it('alakasız görevler yemekhaneye yazılmaz', () => {
    expect(inferWorkArea({ position: 'Elektrik Teknisyeni' })).toBe('')
    expect(inferWorkArea({ dept_name: 'Güvenlik' })).toBe('')
    expect(inferWorkArea({ dept_name: 'Çamaşırhane', position: 'Ütücü' })).toBe('')
  })

  // "Aşçı" yaygın bir SOYADI; kişinin adı çalışma alanını belirlememeli.
  it('kişinin adı çalışma alanını belirlemez', () => {
    expect(inferWorkArea({ full_name: 'Mehmet Aşçı', position: 'Kaynakçı' })).toBe('')
    expect(inferWorkArea({ full_name: 'Ayşe Yemekçi', dept_name: 'Teknik' })).toBe('')
  })

  it('hiçbir şey bilinmiyorsa boş kalır, "Genel" uydurulmaz', () => {
    expect(inferWorkArea({})).toBe('')
    expect(inferWorkArea({ dept_name: '', position: '' })).toBe('')
  })

  it('site bilgisi varsa görevle birleşir', () => {
    expect(inferWorkArea({ dept_name: 'OTC', position: 'İkramcı' })).toBe('OTC Yemekhane')
    expect(inferWorkArea({ dept_name: 'Kamp Sahası', position: 'Teknisyen' })).toBe('Kamp')
  })
})
