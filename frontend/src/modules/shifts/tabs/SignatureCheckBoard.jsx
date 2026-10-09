import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { formatDate } from '../shared.jsx'
import { parseSignatureSheet, MARK_LABELS } from '../logic/signatureSheetParse.js'

// İmzalı föy kontrolü.
//
// Islak imzayla dönen föy elle (ya da fotoğraftan okunmuş metin olarak)
// yapıştırılır, çizelgeyle karşılaştırılır. SALT OKUMA: puantaja hiçbir şey
// yazılmaz; föyde RAPOR yazıyor diye puantaj değişmez, fark kişi kişi gösterilir.

const toastErr = e => useToastStore.getState().addToast(e?.response?.data?.error || e?.message || 'Kontrol başarısız', 'error')

const LEVEL_COLOR = { warn: 'var(--red)', info: 'var(--text3)', ok: 'var(--green)' }

const ORNEK = 'Ayşe Demir\nMehmet Kaya - boş\nAli Veli - off\nFatma Yıldız - rapor'

function Satir({ item }) {
  return (
    <li style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '3px 0', fontSize: 12 }}>
      <span style={{ color: LEVEL_COLOR[item.level], width: 14 }}>{item.level === 'warn' ? '⚠' : item.level === 'ok' ? '✓' : '·'}</span>
      <strong style={{ minWidth: 160 }}>{item.full_name}</strong>
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

  const parsed = parseSignatureSheet(metin, tarih)

  const kontrol = useMutation({
    mutationFn: () => api.post('/shifts/schedule/signature-check', {
      rows: parsed.rows,
      ...(bolum ? { department_id: Number(bolum) } : {}),
    }).then(r => r.data),
    onSuccess: setSonuc,
    onError: toastErr,
  })

  const uyarilar = (sonuc?.items || []).filter(i => i.level === 'warn')
  const tamam = (sonuc?.items || []).filter(i => i.level !== 'warn')
  const s = sonuc?.summary

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
          <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 8px' }}>
            Her satıra bir kişi yazın. İşaret yoksa satır <b>imzalı</b> sayılır; "Ad Soyad - boş / off / rapor / izin / yıllık / gelmedi".
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
            {kontrol.isPending ? 'Kontrol ediliyor…' : `Çizelgeyle karşılaştır (${parsed.rows.length} kişi)`}
          </button>

          {sonuc && (
            <div style={{ marginTop: 12 }} aria-label="Föy kontrol sonucu">
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                <b>{formatDate(tarih)}</b> · imzalı {s.signed_ok} · imza aranmayan {s.not_working_ok} ·{' '}
                <span style={{ color: s.warnings ? 'var(--red)' : 'inherit' }}>uyarı {s.warnings}</span>
                {s.unmatched > 0 && <> · <span style={{ color: 'var(--red)' }}>eşleşmeyen {s.unmatched}</span></>}
                {s.not_on_sheet > 0 && <> · <span style={{ color: 'var(--red)' }}>föyde yok {s.not_on_sheet}</span></>}
              </div>

              {uyarilar.length > 0 && (
                <>
                  <h4 style={{ fontSize: 12, margin: '8px 0 2px', color: 'var(--red)' }}>Kontrol edilmesi gerekenler</h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{uyarilar.map(i => <Satir key={i.index} item={i} />)}</ul>
                </>
              )}

              {sonuc.unmatched.length > 0 && (
                <>
                  <h4 style={{ fontSize: 12, margin: '8px 0 2px', color: 'var(--red)' }}>Eşleşmeyen satırlar</h4>
                  <ul style={{ fontSize: 12, margin: 0 }}>
                    {sonuc.unmatched.map(u => (
                      <li key={u.index}>
                        <b>{u.name}</b>: {u.reason}
                        {u.candidates.length > 0 && <> ({u.candidates.map(c => `#${c.id}`).join(', ')})</>}
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
                    {sonuc.not_on_sheet.map(n => <li key={`${n.staff_id}-${n.date}`}>{n.full_name} <span style={{ color: 'var(--text3)' }}>{n.department}</span></li>)}
                  </ul>
                </details>
              )}

              {tamam.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 12, cursor: 'pointer' }}>Sorunsuz {tamam.length} kişi</summary>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{tamam.map(i => <Satir key={i.index} item={i} />)}</ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
