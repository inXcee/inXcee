// Çapraz çalışma dökümü — Excel çıktısı.
//
// İki proje aynı anda yürüdüğünde bu liste sadece bilgi değil, projeler arası
// maliyet aktarımının dayanağı: "FPU kadrosundaki şu kişi Kamp sahasında şu
// kadar gün çalıştı". Bu yüzden gün gün satırlar da veriliyor, sadece özet değil.
import { saveWorkbook } from '../../../shared/logic/excelKit.js'
import { summarizeCrossover, crossoverDirections } from './projectCrossover.js'

const BASLIK_DOLGU = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }

function basligiKur(ws, satirNo, degerler) {
  const satir = ws.getRow(satirNo)
  satir.values = degerler
  satir.font = { bold: true }
  satir.eachCell(cell => { cell.fill = BASLIK_DOLGU })
  return satir
}

export function buildCrossoverWorkbook(ExcelJS, { from, to, payload } = {}) {
  const rows = payload?.rows || []
  const setup = payload?.setup || {}
  const kisiler = summarizeCrossover(rows)
  const yonler = crossoverDirections(rows)

  const workbook = new ExcelJS.Workbook()

  // 1) Özet: kim, nereden nereye, kaç gün
  const ws = workbook.addWorksheet('Çapraz Çalışma', { views: [{ state: 'frozen', ySplit: 3 }] })
  ws.columns = [
    { width: 5 }, { width: 28 }, { width: 16 }, { width: 16 },
    { width: 8 }, { width: 24 }, { width: 34 },
  ]
  ws.mergeCells('A1:G1')
  ws.getCell('A1').value = 'ÇAPRAZ ÇALIŞMA — KADROSU DIŞINDA ÇALIŞANLAR'
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.mergeCells('A2:G2')
  // Eksik eşleme çıktıda da yazılmalı: kâğıdı okuyan kişi listenin tam olup
  // olmadığını bilmeden maliyet aktarımı yapmasın.
  const eksik = setup.unmapped_locations || 0
  ws.getCell('A2').value = eksik
    ? `${from} – ${to} · ${kisiler.length} kişi · DİKKAT: ${eksik} çalışma noktası projeye bağlı değil, liste eksik olabilir`
    : `${from} – ${to} · ${kisiler.length} kişi · Tüm çalışma noktaları projeye bağlı`
  ws.getCell('A2').font = { color: { argb: eksik ? 'FFB45309' : 'FF666666' }, size: 10, bold: !!eksik }

  basligiKur(ws, 3, ['#', 'Personel', 'Kadrosu', 'Çalıştığı Proje', 'Gün', 'Tarih Aralığı', 'Çalışma Noktaları'])
  kisiler.forEach((k, idx) => {
    ws.addRow([
      idx + 1, k.name, k.rosterProject, k.workedProject, k.days,
      k.firstDate === k.lastDate ? k.firstDate : `${k.firstDate} – ${k.lastDate}`,
      k.locations.join(', '),
    ])
  })
  if (!kisiler.length) {
    ws.addRow(['', eksik ? 'Hesaplanamadı — noktalar projeye bağlanmalı' : 'Kadrosu dışında çalışan yok'])
  }

  // 2) Yön kırılımı: proje→proje kaç kişi/gün — maliyet aktarımının özeti
  const wsYon = workbook.addWorksheet('Yön Özeti')
  wsYon.columns = [{ width: 18 }, { width: 18 }, { width: 10 }, { width: 10 }]
  basligiKur(wsYon, 1, ['Kadro Projesi', 'Çalışılan Proje', 'Kişi', 'Gün'])
  yonler.forEach(y => wsYon.addRow([y.from, y.to, y.people, y.days]))
  if (!yonler.length) wsYon.addRow(['—', '—', 0, 0])

  // 3) Gün gün ham satırlar: itiraz gelirse dayanak burada
  const wsGun = workbook.addWorksheet('Gün Dökümü', { views: [{ state: 'frozen', ySplit: 1 }] })
  wsGun.columns = [{ width: 12 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 24 }]
  basligiKur(wsGun, 1, ['Tarih', 'Personel', 'Kadrosu', 'Çalıştığı Proje', 'Çalışma Noktası'])
  rows.forEach(row => {
    wsGun.addRow([
      row.work_date, row.full_name, row.roster_project_name,
      row.worked_project_name, row.work_location_name || '',
    ])
  })

  return { workbook, personCount: kisiler.length, dayCount: rows.length }
}

export async function exportCrossoverExcel({ from, to, payload }) {
  const ExcelJS = (await import('exceljs')).default
  const { workbook } = buildCrossoverWorkbook(ExcelJS, { from, to, payload })
  const buf = await workbook.xlsx.writeBuffer()
  saveWorkbook(buf, `capraz-calisma-${from}_${to}.xlsx`, {
    onError: (error) => { error.response = { data: { error: 'Çapraz çalışma dökümü indirilemedi' } } },
  })
}
