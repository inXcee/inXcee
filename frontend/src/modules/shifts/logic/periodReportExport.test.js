import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildPeriodReportWorkbook, periodReportFileName } from './periodReportExport.js'

// Faz 13: rapor ay sonu toplantısına dosya olarak gidiyor. Ölçülemeyen bölüm
// Excel'de de SIFIR görünmemeli — boş sayfa "sorun yok" diye okunur.

const RAPOR = {
  period: '2026-04',
  sections: {
    planned_vs_actual: {
      measurable: true,
      days: [{ date: '2026-04-01', planned: 3, actual: 2, absent: 1 }],
      total_planned: 3, total_actual: 2, realization: 0.667, realization_note: null,
    },
    coverage_success: {
      measurable: true, overall_ratio: 0.8, rule_days: 30, met_days: 24,
      chronically_short: [{ rule_id: 1, rule_name: 'OTC gündüz', applicable_days: 30, met_days: 24, short_days: 6, ratio: 0.8 }],
    },
    absence: { measurable: true, total_days: 4, without_reason: 1, people: [{ staff_id: 10, full_name: 'Ali Veli', days: 4, without_reason: 1 }] },
    leave_ranking: { measurable: true, total_days: 5, people: [{ staff_id: 10, full_name: 'Ali Veli', requests: 1, days: 5 }] },
    overtime_ranking: { measurable: true, total_hours: 13, people: [{ staff_id: 11, full_name: 'Ayşe Can', days: 2, hours: 9 }] },
    project_load: {
      measurable: true,
      projects: [{ project: 'FPU', person_days: 12, people: 4 }],
      cost_note: 'Para cinsinden maliyet hesaplanmıyor — saatlik ücret verisi sistemde tutulmuyor',
    },
    approval_times: { measurable: true, average_days: 4, unmeasured: 1, periods: [{ period: '2026-03', status: 'approved', days: 4 }] },
    pre_exit_trends: { measurable: true, count: 1, people: [{ staff_id: 12, full_name: 'Veli Ak', exit_date: '2026-04-20', absences_60d: 3, leaves_60d: 1 }] },
  },
  unmeasurable: [],
}

const kur = (rapor = RAPOR) => buildPeriodReportWorkbook(ExcelJS, { report: rapor })
const metin = ws => ws.getSheetValues().flat().filter(Boolean).map(String).join(' | ')

describe('Dönem raporu Excel çıktısı', () => {
  it('altı sayfa üretir', () => {
    expect(kur().worksheets.map(w => w.name)).toEqual([
      'Planlanan-Gerçekleşen', 'Kapsama', 'Devamsızlık', 'İzin-Mesai', 'Proje', 'Onay-Ayrılma',
    ])
  })

  it('planlanan ve gerçekleşeni toplamıyla yazar', () => {
    const s = metin(kur().getWorksheet('Planlanan-Gerçekleşen'))
    expect(s).toContain('2026-04-01')
    expect(s).toContain('TOPLAM')
    expect(s).toContain('%67')
  })

  // Oran hesaplanamadıysa 0 yazmak "hiç tutmadı" diye okunurdu.
  it('gerçekleşme oranı yoksa gerekçeyi yazar', () => {
    const s = metin(kur({
      ...RAPOR,
      sections: {
        ...RAPOR.sections,
        planned_vs_actual: {
          measurable: true, days: [], total_planned: 0, total_actual: 0,
          realization: null, realization_note: 'Bu dönemde hiç plan girilmemiş — gerçekleşme oranı hesaplanamaz',
        },
      },
    }).getWorksheet('Planlanan-Gerçekleşen'))
    expect(s).toContain('hiç plan girilmemiş')
    expect(s).not.toContain('%0')
  })

  // Ölçülemeyen bölüm boş sayfa bırakmamalı.
  it('ölçülemeyen bölümde sebebi yazar', () => {
    const s = metin(kur({
      ...RAPOR,
      sections: { ...RAPOR.sections, coverage_success: { measurable: false, reason: 'Hiç kapsama kuralı tanımlı değil' } },
    }).getWorksheet('Kapsama'))
    expect(s).toContain('Bu bölüm ölçülemedi')
    expect(s).toContain('Hiç kapsama kuralı tanımlı değil')
  })

  it('sürekli açık kalan kuralı eksik günüyle listeler', () => {
    expect(metin(kur().getWorksheet('Kapsama'))).toContain('OTC gündüz')
  })

  it('izin ve mesai sıralamasını yan yana yazar', () => {
    const s = metin(kur().getWorksheet('İzin-Mesai'))
    expect(s).toContain('Ali Veli')
    expect(s).toContain('Ayşe Can')
  })

  // Para cinsinden maliyet uydurulmadığı dosyada da yazmalı.
  it('proje sayfasında maliyet notunu taşır', () => {
    expect(metin(kur().getWorksheet('Proje'))).toContain('saatlik ücret verisi sistemde tutulmuyor')
  })

  it('onay ve ayrılma sayfasını birlikte yazar', () => {
    const s = metin(kur().getWorksheet('Onay-Ayrılma'))
    expect(s).toContain('2026-03')
    expect(s).toContain('Veli Ak')
  })

  it('damgasız onay süresini ölçülemedi diye yazar', () => {
    const s = metin(kur({
      ...RAPOR,
      sections: {
        ...RAPOR.sections,
        approval_times: { measurable: true, average_days: null, unmeasured: 1, periods: [{ period: '2026-02', status: 'approved', days: null }] },
      },
    }).getWorksheet('Onay-Ayrılma'))
    expect(s).toContain('ölçülemedi')
  })

  it('dosya adı dönemi taşır', () => {
    expect(periodReportFileName('2026-04')).toBe('vardiya-donem-raporu-2026-04.xlsx')
    expect(periodReportFileName()).toContain('donem')
  })

  it('boş rapor gövdesinde çökmez', () => {
    expect(() => buildPeriodReportWorkbook(ExcelJS, {})).not.toThrow()
  })
})
