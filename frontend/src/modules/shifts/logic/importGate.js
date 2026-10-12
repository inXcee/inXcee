// Çizelge aktarımı zorunlu kontrolleri — backend `report.blockers` ile kullanıcının
// ekranda verdiği çözümleri karşılaştırır. Sunucu yine kendi kontrolünü yapar (409);
// bu yalnız "İçe Aktar" düğmesini doğru anda açmak ve neyin eksik olduğunu söylemek için.

export const STAFF_FIELDS = ['hire_date', 'position', 'project_id']
export const FIELD_LABEL = { hire_date: 'işe giriş', position: 'rol', project_id: 'proje' }

export function staffInfoComplete(info) {
  return !!info && /^\d{4}-\d{2}-\d{2}$/.test(info.hire_date || '') &&
    !!String(info.position || '').trim() && !!info.project_id
}

// Dönüş: { open: [{ kind, message }], resolved: boolean }
export function gateStatus(report, { confirm = {}, newStaff = {}, skipNames = [], mappings = {} } = {}) {
  const open = []
  for (const b of report?.blockers || []) {
    if (b.kind === 'unknown_codes' && !confirm.unrecognized) open.push(b)
    else if (b.kind === 'ambiguous_staff' && !confirm.fuzzy) open.push(b)
    else if (b.kind === 'new_staff_incomplete') {
      const left = b.items.filter(s =>
        !skipNames.includes(s.name) && !mappings[s.name] && !staffInfoComplete(newStaff[s.name]))
      if (left.length) open.push({ ...b, items: left, message: `${left.length} yeni personelin bilgisi eksik` })
    }
  }
  return { open, resolved: open.length === 0 }
}

const REASON = { empty: 'boş', unmatched: 'tanımsız', ambiguous: 'belirsiz' }

// Eksik görev yeri listesi → "AD SOYAD: 12.10 (boş), 13.10 (tanımsız: X)" satırları
export function missingLocationLines(missing = []) {
  return missing.map(p => ({
    name: p.name,
    deptName: p.deptName,
    text: p.days.map(d => {
      const [, m, day] = d.date.split('-')
      return `${day}.${m} (${REASON[d.reason] || d.reason}${d.raw ? `: ${d.raw}` : ''})`
    }).join(', '),
  }))
}
