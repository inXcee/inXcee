// İmzalı föy kontrol sonucunu WhatsApp/Telegram'a yapıştırılacak düz metne çevirir
// ve öneri seçilince föy metnindeki ismi düzeltir.

import { MARK_LABELS } from './signatureSheetParse.js'

const gg = iso => {
  const [, m, d] = String(iso).split('-')
  return d && m ? `${d}.${m}` : iso
}

// Satır başındaki isim — "3. Ayşe Demir - off" / "Ayşe Demir⇥✓⇥…" — tam eşleşirse değiştirilir.
// Başka satırlardaki benzer isimlere ve not kısmına dokunulmaz.
export function replaceSheetName(text, oldName, newName) {
  const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^(\\s*(?:\\d+[.)]\\s*)?)${esc}(?=\\s*(?:$|\\t|;|:|\\||\\s[-–—]\\s))`, 'gmu')
  return String(text).replace(re, (_, prefix) => `${prefix}${newName}`)
}

export function signatureReportText(sonuc, { title = 'İmzalı föy kontrolü' } = {}) {
  if (!sonuc) return ''
  const s = sonuc.summary
  const cokGun = (sonuc.dates || []).length > 1
  const gun = cokGun ? `${gg(sonuc.dates[0])}–${gg(sonuc.dates.at(-1))}` : gg(sonuc.dates?.[0] || '')
  const out = [
    `✍️ ${title} — ${gun}`,
    `İmzalı ${s.signed_ok} · imza aranmayan ${s.not_working_ok} · uyarı ${s.warnings}`,
  ]
  const uyarilar = sonuc.items.filter(i => i.level === 'warn')
  if (uyarilar.length) {
    out.push('', '⚠️ Kontrol edilmesi gerekenler:')
    for (const i of uyarilar) {
      out.push(`• ${i.full_name}${cokGun ? ` (${gg(i.date)})` : ''} — ${MARK_LABELS[i.mark]}: ${i.text}${i.note ? ` [${i.note}]` : ''}`)
    }
  }
  if (sonuc.unmatched.length) {
    out.push('', '❓ Eşleşmeyen:')
    for (const u of sonuc.unmatched) {
      const oneri = u.suggestions?.length ? ` → ${u.suggestions.map(x => x.full_name).join(' / ')}?` : ''
      out.push(`• ${u.name ?? `#${u.staff_id}`}: ${u.reason}${oneri}`)
    }
  }
  if (sonuc.not_on_sheet.length) {
    out.push('', `📋 Çalışıyor ama föyde yok (${sonuc.not_on_sheet.length}):`)
    for (const n of sonuc.not_on_sheet) out.push(`• ${n.full_name}${cokGun ? ` (${gg(n.date)})` : ''}`)
  }
  if (!uyarilar.length && !sonuc.unmatched.length && !sonuc.not_on_sheet.length) out.push('', '✅ Fark yok.')
  out.push('', 'Salt okuma — puantaja bir şey yazılmadı.')
  return out.join('\n')
}
