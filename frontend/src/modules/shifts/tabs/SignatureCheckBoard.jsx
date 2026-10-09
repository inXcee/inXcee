import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { formatDate } from '../shared.jsx'
import { parseSignatureSheet, MARK_LABELS } from '../logic/signatureSheetParse.js'
import { replaceSheetName, signatureReportText } from '../logic/signatureReport.js'
import SignatureCoverageGrid, { COVERAGE_KEY } from './SignatureCoverageGrid.jsx'

// İmzalı föy kontrolü.
//
// Islak imzayla dönen föy elle (ya da fotoğraftan okunmuş metin olarak)
// yapıştırılır, çizelgeyle karşılaştırılır. SALT OKUMA: puantaja hiçbir şey
// yazılmaz; föyde RAPOR yazıyor diye puantaj değişmez, fark kişi kişi gösterilir.

const toastErr = e => useToastStore.getState().addToast(e?.response?.data?.error || e?.message || 'Kontrol başarısız', 'error')

const LEVEL_COLOR = { warn: 'var(--red)', info: 'var(--text3)', ok: 'var(--green)' }

const ORNEK = 'Ayşe Demir\nMehmet Kaya - boş\nAli Veli - off\nFatma Yıldız - rapor'

function Satir({ item, cokGun }) {
  return (
    <li style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '3px 0', fontSize: 12, flexWrap: 'wrap' }}>
      <span style={{ color: LEVEL_COLOR[item.level], width: 14 }}>{item.level === 'warn' ? '⚠' : item.level === 'ok' ? '✓' : '·'}</span>
      {cokGun && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', minWidth: 44 }}>{formatDate(item.date)}</span>}
      <strong style={{ minWidth: 160 }} title={item.matched_by === 'word_order' ? `Föyde "${item.sheet_name}" yazıyor (ad/soyad sırası farklı)` : undefined}>
        {item.full_name}{item.matched_by === 'word_order' && <span style={{ color: 'var(--text3)', fontWeight: 400 }}> ⇄</span>}
      </strong>
      <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11, minWidth: 70 }}>{MARK_LABELS[item.mark]}</span>
      <span style={{ color: item.level === 'warn' ? 'var(--text)' : 'var(--text3)' }}>{item.text}</span>
      {item.note && <em style={{ color: 'var(--text3)' }}>({item.note})</em>}
    </li>
  )
}

export default function SignatureCheckBoard({ weekDays = [], departments = [] }) {
  const [acik, setAcik] = useState(false)
  const [tarih, setTarih] = useState(() => {
    const bugun = new Date().toLocaleDateString('sv-SE')
    return weekDays.includes(bugun) ? bugun : (weekDays[0] || bugun)
  })
  const [bolum, setBolum] = useState('')
  const [metin, setMetin] = useState('')
  const [sonuc, setSonuc] = useState(null)
  const [kaydet, setKaydet] = useState(true)
  const qc = useQueryClient()

  // Takip tablosundan "gelmedi" hücresi seçildi → o gün ve bölüm forma.
  const hucreSec = ({ date, department_id }) => {
    setTarih(date)
    setBolum(String(department_id))
    setSonuc(null)
  }

  const parsed = parseSignatureSheet(metin, tarih, weekDays)
  const gunSayisi = new Set(parsed.rows.map(r => r.date)).size

  const oneriyiUygula = (eski, yeni) => { setMetin(m => replaceSheetName(m, eski, yeni)); setSonuc(null) }

  const raporuKopyala = async () => {
    try {
      await navigator.clipboard.writeText(signatureReportText(sonuc))
      useToastStore.getState().addToast('Rapor panoya kopyalandı', 'success')
    } catch {
      useToastStore.getState().addToast('Panoya kopyalanamadı', 'error')
    }
  }

  const kontrol = useMutation({
    mutationFn: () => api.post('/shifts/schedule/signature-check', {
      rows: parsed.rows,
      ...(bolum ? { department_id: Number(bolum) } : {}),
      ...(kaydet ? { save: true, source: 'web' } : {}),
    }).then(r => r.data),
    onSuccess: data => {
      setSonuc(data)
      if (data.saved) qc.invalidateQueries({ queryKey: [COVERAGE_KEY] })
    },
    onError: toastErr,
  })

  const uyarilar = (sonuc?.items || []).filter(i => i.level === 'warn')
  const tamam = (sonuc?.items || []).filter(i => i.level !== 'warn')
  const s = sonuc?.summary
  const cokGun = (sonuc?.dates || []).length > 1

  return (
    <div className="panel" style={{ marginBottom: 12, borderLeft: `3px solid ${s?.warnings ? 'var(--red)' : 'var(--accent)'}` }}>
      <button
        type="button"
        onClick={() => setAcik(a => !a)}
        aria-expanded={acik}
        aria-label="İmzalı föy kontrolü"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--accent)', width: 12 }}>{acik ? '▾' : '▸'}</span>
        <strong style={{ fontSize: 13 }}>✍️ İMZALI FÖY KONTROLÜ</strong>
        {s && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: s.warnings ? 'var(--red)' : 'var(--green)' }}>
            {s.warnings ? `${s.warnings} uyarı` : 'fark yok'} · {s.matched}/{s.rows} eşleşti
          </span>
        )}
      </button>

      {acik && (
        <div style={{ padding: '0 14px 12px' }}>
          <SignatureCoverageGrid weekDays={weekDays} onPick={hucreSec} />
          <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 8px' }}>
            Her satıra bir kişi yazın. İşaret yoksa satır <b>imzalı</b> sayılır; "Ad Soyad - boş / off / rapor / izin / yıllık / gelmedi".
            Excel'den haftalık ızgara da yapıştırılabilir (Ad ⇥ Pzt ⇥ Sal …; boş hücre = imza yok), o zaman günler haftadan alınır.
            Puantaja hiçbir şey yazılmaz, yalnız çizelgeyle fark gösterilir.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <label style={{ fontSize: 12 }}>
              Föy günü{' '}
              <input type="date" value={tarih} onChange={e => { setTarih(e.target.value); setSonuc(null) }} aria-label="Föy günü" />
            </label>
            <label style={{ fontSize: 12 }}>
              Bölüm{' '}
              <select value={bolum} onChange={e => { setBolum(e.target.value); setSonuc(null) }} aria-label="Bölüm">
                <option value="">Föydeki bölümler</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12 }} title="Kontrol sonucu föy dönüş takibine işlenir; puantaj değişmez">
              <input type="checkbox" checked={kaydet} onChange={e => setKaydet(e.target.checked)} aria-label="Föy takibine işle" />{' '}
              Föy takibine işle
            </label>
          </div>
          <textarea
            value={metin}
            onChange={e => { setMetin(e.target.value); setSonuc(null) }}
            placeholder={ORNEK}
            rows={8}
            aria-label="Föy satırları"
            style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 12 }}
          />
          {parsed.errors.length > 0 && (
            <ul style={{ color: 'var(--red)', fontSize: 11, margin: '4px 0' }}>
              {parsed.errors.map(e => <li key={e.line}>Satır {e.line}: {e.reason}</li>)}
            </ul>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!parsed.rows.length || parsed.errors.length > 0 || kontrol.isPending}
            onClick={() => kontrol.mutate()}
            style={{ marginTop: 6 }}
          >
            {kontrol.isPending
              ? 'Kontrol ediliyor…'
              : `Çizelgeyle karşılaştır (${parsed.rows.length} satır${gunSayisi > 1 ? ` · ${gunSayisi} gün` : ''})`}
          </button>
          {sonuc && (
            <button type="button" className="btn" onClick={raporuKopyala} style={{ marginTop: 6, marginLeft: 8 }}>
              📋 Raporu kopyala
            </button>
          )}

          {sonuc && (
            <div style={{ marginTop: 12 }} aria-label="Föy kontrol sonucu">
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                <b>{cokGun ? `${formatDate(sonuc.dates[0])} – ${formatDate(sonuc.dates.at(-1))}` : formatDate(sonuc.dates?.[0] || tarih)}</b> · imzalı {s.signed_ok} · imza aranmayan {s.not_working_ok} ·{' '}
                <span style={{ color: s.warnings ? 'var(--red)' : 'inherit' }}>uyarı {s.warnings}</span>
                {s.unmatched > 0 && <> · <span style={{ color: 'var(--red)' }}>eşleşmeyen {s.unmatched}</span></>}
                {s.not_on_sheet > 0 && <> · <span style={{ color: 'var(--red)' }}>föyde yok {s.not_on_sheet}</span></>}
                {sonuc.saved && <span style={{ color: 'var(--text3)' }}> · takibe işlendi</span>}
              </div>

              {uyarilar.length > 0 && (
                <>
                  <h4 style={{ fontSize: 12, margin: '8px 0 2px', color: 'var(--red)' }}>Kontrol edilmesi gerekenler</h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{uyarilar.map(i => <Satir key={i.index} item={i} cokGun={cokGun} />)}</ul>
                </>
              )}

              {sonuc.unmatched.length > 0 && (
                <>
                  <h4 style={{ fontSize: 12, margin: '8px 0 2px', color: 'var(--red)' }}>Eşleşmeyen satırlar</h4>
                  <ul style={{ fontSize: 12, margin: 0 }}>
                    {/* Haftalık ızgarada aynı isim 7 kez eşleşmez — bir kez göster. */}
                    {sonuc.unmatched.filter((u, i, all) => all.findIndex(x => x.name === u.name && x.staff_id === u.staff_id) === i).map(u => (
                      <li key={u.index} style={{ marginBottom: 2 }}>
                        <b>{u.name ?? `#${u.staff_id}`}</b>: {u.reason}
                        {u.candidates.length > 0 && <> ({u.candidates.map(c => `#${c.id}`).join(', ')})</>}
                        {u.name && u.suggestions?.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            className="btn btn-sm"
                            onClick={() => oneriyiUygula(u.name, o.full_name)}
                            title={`Föy metninde "${u.name}" → "${o.full_name}" (${o.department || 'bölümsüz'}${o.is_active ? '' : ', pasif'})`}
                            style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px' }}
                          >
                            {o.full_name}?{!o.is_active && ' (pasif)'}
                          </button>
                        ))}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {sonuc.not_on_sheet.length > 0 && (
                // Uzun liste (bölüm seçilmeden yapıştırılan kısa föy) asıl uyarıları aşağı itmesin.
                <details open={sonuc.not_on_sheet.length <= 10} style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--red)', fontWeight: 600 }}>
                    Çalışıyor ama föyde yok ({sonuc.not_on_sheet.length})
                  </summary>
                  <ul style={{ fontSize: 12, margin: 0 }}>
                    {sonuc.not_on_sheet.map(n => <li key={`${n.staff_id}-${n.date}`}>{cokGun && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{formatDate(n.date)} </span>}{n.full_name} <span style={{ color: 'var(--text3)' }}>{n.department}</span></li>)}
                  </ul>
                </details>
              )}

              {tamam.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 12, cursor: 'pointer' }}>Sorunsuz {tamam.length} kişi</summary>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{tamam.map(i => <Satir key={i.index} item={i} cokGun={cokGun} />)}</ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
