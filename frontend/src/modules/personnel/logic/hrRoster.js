// İK kadro mutabakatı — saf yardımcılar (panel + test).

export const SECTIONS = [
  { key: 'exit_pending', title: 'Puantajda çıkış var, YYS\'de aktif', tone: 'red',
    hint: 'İK çıkış tarihi girmiş; personel kartından işten çıkışı başlatın.' },
  { key: 'archived_present', title: 'YYS\'de arşivli, puantajda çalışıyor', tone: 'red',
    hint: 'Arşivlenmiş ama güncel puantajda çıkışsız. Çalışıyorsa geri alın, ayrıldıysa İK puantajı güncellensin.' },
  { key: 'roster_only', title: 'Puantajda var, YYS\'de karşılığı yok', tone: 'amber',
    hint: 'Yazım farkıysa aday kişiyle eşleştirin; gerçekten yeni ise çizelge aktarımında bilgileriyle açılır.' },
  { key: 'missing', title: 'YYS\'de aktif, puantajda yok', tone: 'amber',
    hint: 'Yazım farkı (yukarıdaki listeyle eşleştirin) ya da ayrılmış olabilir.' },
  { key: 'mismatches', title: 'Kayıt farkı (işe giriş / proje)', tone: 'blue',
    hint: 'İki taraf da dolu ama farklı; doğru olanı personel kartında düzeltin. Otomatik değiştirilmez.' },
  { key: 'fillable', title: 'Doldurulabilir boş alanlar', tone: 'green',
    hint: 'YYS\'de boş (ya da geçersiz TC) alanlar puantajdan doldurulabilir. Dolu alana dokunulmaz.' },
]

export const FIELD_LABEL = { tc_no: 'TC', hire_date: 'işe giriş', position: 'görev', project_id: 'proje' }

export function ageLabel(hours) {
  if (hours == null) return '—'
  if (hours < 1) return 'az önce'
  if (hours < 24) return `${Math.round(hours)} saat önce`
  return `${Math.round(hours / 24)} gün önce`
}

export function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return d && m && y ? `${d}.${m}.${y}` : String(iso)
}

// TC tam gösterilmez (ekran görüntüsünde sızmasın): ilk 3 + son 2 hane.
export function maskTc(tc) {
  const s = String(tc || '')
  return s.length === 11 ? `${s.slice(0, 3)}******${s.slice(-2)}` : s ? '***' : '—'
}

export function fillSummary(fields) {
  return Object.entries(fields || {})
    // proje id'si anlamsız; panel proje adını ayrıca yazar
    .map(([k, v]) => (k === 'project_id' ? FIELD_LABEL[k]
      : `${FIELD_LABEL[k] || k}: ${k === 'tc_no' ? maskTc(v) : k === 'hire_date' ? fmtDate(v) : v}`))
    .join(' · ')
}

// Ajan turu özeti satırı (run.counts → okunur metin)
export function runLine(run) {
  const c = run?.counts
  if (!c) return null
  const parts = [
    c.written != null ? `${c.written} hücre yazıldı` : c.changes != null ? `${c.changes} değişiklik` : null,
    c.conflicts ? `${c.conflicts} çakışma` : null,
    c.manual ? `${c.manual} elle işlenecek` : null,
    c.unmatched ? `${c.unmatched} eşleşmeyen ad` : null,
    c.skipped_files ? `${c.skipped_files} dosya atlandı (Excel açıktı)` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'değişiklik yok'
}
