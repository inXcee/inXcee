// Puantaj özeti gruplama — saf fonksiyon, ekrandan bağımsız test edilir.
//
// İki proje aynı anda yürüdüğü için "hangi kadronun maliyeti ne" sorusu
// departman kırılımı kadar sık soruluyor. Gruplama anahtarı bu yüzden dışarıdan
// veriliyor; ekran yalnızca hangi kırılımı istediğini söyler.

export const GROUP_MODES = [
  ['dept', 'Departman'],
  ['project', 'Proje'],
]

// Kadrosu olmayan kişi kendi kovasında toplanır. 'Departmansız' ile aynı
// mantık: sessizce bir gruba karıştırılırsa o grubun maliyeti yanlış okunur.
export function groupKeyOf(row, mode) {
  if (mode === 'project') return row.project_name || 'Kadrosu belirsiz'
  return row.dept_name || 'Departmansız'
}

const ALANLAR = [
  ['worked', 'worked_days'],
  ['absent', 'absent_days'],
  ['overtime', 'overtime_hours'],
  ['leave', 'leave_days'],
  ['gross', 'gross'],
  ['net', 'net'],
  ['employer', 'employer_total_cost'],
]

export function groupPuantajRows(rows = [], mode = 'dept') {
  const map = new Map()
  rows.forEach(row => {
    const name = groupKeyOf(row, mode)
    if (!map.has(name)) {
      const bos = { name, staff: 0 }
      ALANLAR.forEach(([hedef]) => { bos[hedef] = 0 })
      map.set(name, bos)
    }
    const grup = map.get(name)
    grup.staff += 1
    ALANLAR.forEach(([hedef, kaynak]) => { grup[hedef] += row[kaynak] || 0 })
  })
  // En pahalı grup üstte: maliyet karşılaştırması için açılan ekranda önce o
  // görünsün. Eşitlikte ada göre, sıralama koşudan koşuya değişmesin.
  return [...map.values()].sort((a, b) => b.employer - a.employer || a.name.localeCompare(b.name, 'tr'))
}
