// Faz 13 — Dönem raporu Excel çıktısı.
//
// Rapor ekranda okunur ama ay sonu toplantısına dosya olarak gider. Ölçülemeyen
// bölüm Excel'de de SIFIR görünmez: sayfa açılır ve neden ölçülemediği yazılır.
// Boş bir sayfa "sorun yok" diye okunurdu.

const BASLIK_DOLGU = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }

function basligiKur(ws, satirNo, degerler) {
  const satir = ws.getRow(satirNo)
  satir.values = degerler
  satir.font = { bold: true }
  satir.eachCell(cell => { cell.fill = BASLIK_DOLGU })
  return satir
}

// Ölçülemeyen bölüm için tek satırlık gerekçe sayfası.
function olculemezSayfa(ws, bolum) {
  ws.getRow(1).values = ['Bu bölüm ölçülemedi']
  ws.getRow(1).font = { bold: true }
  ws.getRow(2).values = [bolum?.reason || 'Sebep bildirilmedi']
  ws.getColumn(1).width = 80
}

export function buildPeriodReportWorkbook(ExcelJS, { report } = {}) {
  const workbook = new ExcelJS.Workbook()
  const b = report?.sections || {}

  // 1) Planlanan / gerçekleşen
  const ws1 = workbook.addWorksheet('Planlanan-Gerçekleşen')
  if (!b.planned_vs_actual?.measurable) olculemezSayfa(ws1, b.planned_vs_actual)
  else {
    ws1.columns = [{ width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }]
    basligiKur(ws1, 1, ['Tarih', 'Planlanan', 'Gerçekleşen', 'Devamsız'])
    ;(b.planned_vs_actual.days || []).forEach((g, i) => {
      ws1.getRow(i + 2).values = [g.date, g.planned, g.actual, g.absent]
    })
    const son = (b.planned_vs_actual.days || []).length + 3
    ws1.getRow(son).values = ['TOPLAM', b.planned_vs_actual.total_planned, b.planned_vs_actual.total_actual]
    ws1.getRow(son).font = { bold: true }
    ws1.getRow(son + 1).values = [
      'Gerçekleşme oranı',
      // Oran hesaplanamadıysa 0 yazmak "hiç tutmadı" diye okunurdu.
      b.planned_vs_actual.realization == null
        ? b.planned_vs_actual.realization_note
        : `%${Math.round(b.planned_vs_actual.realization * 100)}`,
    ]
  }

  // 2) Kapsama
  const ws2 = workbook.addWorksheet('Kapsama')
  if (!b.coverage_success?.measurable) olculemezSayfa(ws2, b.coverage_success)
  else {
    ws2.columns = [{ width: 30 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 10 }]
    ws2.getRow(1).values = [
      'Genel kapsama',
      b.coverage_success.overall_ratio == null ? 'ölçülemedi' : `%${Math.round(b.coverage_success.overall_ratio * 100)}`,
      `${b.coverage_success.met_days}/${b.coverage_success.rule_days} kural-gün`,
    ]
    ws2.getRow(1).font = { bold: true }
    basligiKur(ws2, 3, ['Kural', 'Geçerli gün', 'Tutan', 'Eksik', 'Oran'])
    ;(b.coverage_success.chronically_short || []).forEach((k, i) => {
      ws2.getRow(i + 4).values = [k.rule_name, k.applicable_days, k.met_days, k.short_days, `%${Math.round(k.ratio * 100)}`]
    })
  }

  // 3) Devamsızlık
  const ws3 = workbook.addWorksheet('Devamsızlık')
  if (!b.absence?.measurable) olculemezSayfa(ws3, b.absence)
  else {
    ws3.columns = [{ width: 28 }, { width: 12 }, { width: 16 }]
    ws3.getRow(1).values = ['Toplam devamsız gün', b.absence.total_days, `nedensiz: ${b.absence.without_reason}`]
    ws3.getRow(1).font = { bold: true }
    basligiKur(ws3, 3, ['Personel', 'Gün', 'Nedensiz'])
    ;(b.absence.people || []).forEach((k, i) => {
      ws3.getRow(i + 4).values = [k.full_name, k.days, k.without_reason]
    })
  }

  // 4) İzin ve mesai sıralaması
  const ws4 = workbook.addWorksheet('İzin-Mesai')
  ws4.columns = [{ width: 28 }, { width: 10 }, { width: 10 }, { width: 4 }, { width: 28 }, { width: 10 }, { width: 10 }]
  basligiKur(ws4, 1, ['İzin — Personel', 'Talep', 'Gün', '', 'Mesai — Personel', 'Gün', 'Saat'])
  const izinler = b.leave_ranking?.measurable ? (b.leave_ranking.people || []) : []
  const mesailer = b.overtime_ranking?.measurable ? (b.overtime_ranking.people || []) : []
  for (let i = 0; i < Math.max(izinler.length, mesailer.length); i++) {
    ws4.getRow(i + 2).values = [
      izinler[i]?.full_name || '', izinler[i]?.requests ?? '', izinler[i]?.days ?? '', '',
      mesailer[i]?.full_name || '', mesailer[i]?.days ?? '', mesailer[i]?.hours ?? '',
    ]
  }
  if (!b.leave_ranking?.measurable) ws4.getRow(2).values = [b.leave_ranking?.reason || 'İzin verisi ölçülemedi']
  if (!b.overtime_ranking?.measurable) ws4.getRow(3).values = [b.overtime_ranking?.reason || 'Mesai verisi ölçülemedi']

  // 5) Proje yükü
  const ws5 = workbook.addWorksheet('Proje')
  if (!b.project_load?.measurable) olculemezSayfa(ws5, b.project_load)
  else {
    ws5.columns = [{ width: 26 }, { width: 14 }, { width: 12 }]
    basligiKur(ws5, 1, ['Proje', 'Kişi-gün', 'Kişi'])
    ;(b.project_load.projects || []).forEach((p, i) => {
      ws5.getRow(i + 2).values = [p.project, p.person_days, p.people]
    })
    // Para cinsinden maliyet uydurulmadığı Excel'de de yazar.
    ws5.getRow((b.project_load.projects || []).length + 3).values = [b.project_load.cost_note]
  }

  // 6) Onay süreleri ve ayrılma eğilimi
  const ws6 = workbook.addWorksheet('Onay-Ayrılma')
  ws6.columns = [{ width: 14 }, { width: 14 }, { width: 10 }, { width: 4 }, { width: 26 }, { width: 14 }, { width: 12 }, { width: 12 }]
  basligiKur(ws6, 1, ['Dönem', 'Durum', 'Gün', '', 'Ayrılan', 'Çıkış', '60g devamsız', '60g izin'])
  const donemler = b.approval_times?.measurable ? (b.approval_times.periods || []) : []
  const ayrilanlar = b.pre_exit_trends?.measurable ? (b.pre_exit_trends.people || []) : []
  for (let i = 0; i < Math.max(donemler.length, ayrilanlar.length); i++) {
    ws6.getRow(i + 2).values = [
      donemler[i]?.period || '', donemler[i]?.status || '',
      donemler[i]?.days == null ? (donemler[i] ? 'ölçülemedi' : '') : donemler[i].days, '',
      ayrilanlar[i]?.full_name || '', ayrilanlar[i]?.exit_date || '',
      ayrilanlar[i]?.absences_60d ?? '', ayrilanlar[i]?.leaves_60d ?? '',
    ]
  }

  return workbook
}

export function periodReportFileName(period) {
  return `vardiya-donem-raporu-${period || 'donem'}.xlsx`
}
