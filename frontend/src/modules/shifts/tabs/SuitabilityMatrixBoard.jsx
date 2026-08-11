import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { shortDay } from '../shared.jsx'

// Faz 11 — Personel uygunluk matrisi.
//
// "Bu vardiyaya kimleri koyabilirim" sorusu bugüne kadar amirin hafızasıyla
// cevaplanıyordu. Matris tüm kadroyu tek tabloda, kontrol kontrol gösterir.
//
// Engelli kişi listeden ÇIKARILMAZ: neden çıkarıldığı görünmezse amir aramaya
// devam eder. Ölçülemeyen kontrolü olan kişi "uygun" sayılmaz, ayrı sayılır.

const RENK = { ok: 'var(--green)', warn: 'var(--amber)', block: 'var(--red)', unknown: 'var(--text3)' }
const ISARET = { ok: '●', warn: '▲', block: '✕', unknown: '?' }

function durum(satir) {
  if (satir.error) return { key: 'unknown', metin: 'çıkarılamadı' }
  if (satir.blockers?.length) return { key: 'block', metin: `${satir.blockers.length} engel` }
  if (satir.unknown?.length) return { key: 'unknown', metin: `${satir.unknown.length} ölçülemedi` }
  if (satir.warnings?.length) return { key: 'warn', metin: `${satir.warnings.length} uyarı` }
  return { key: 'ok', metin: 'uygun' }
}

export default function SuitabilityMatrixBoard({ weekDays = [], shiftDefs = [], departments = [] }) {
  const [acik, setAcik] = useState(false)
  const [tarih, setTarih] = useState(() => weekDays[0] || '')
  const [vardiya, setVardiya] = useState('')
  const [departman, setDepartman] = useState('')
  const [yalnizUygun, setYalnizUygun] = useState(false)

  const gun = tarih || weekDays[0]

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['suitability-matrix', gun, vardiya, departman, yalnizUygun],
    queryFn: () => api.get('/shifts/suitability-matrix', {
      params: {
        date: gun,
        ...(vardiya ? { shift_def_id: vardiya } : {}),
        ...(departman ? { dept_id: departman } : {}),
        ...(yalnizUygun ? { only_eligible: '1' } : {}),
      },
    }).then(r => r.data),
    enabled: acik && !!gun,
  })

  const o = data?.summary || {}

  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setAcik(a => !a)}
        aria-expanded={acik}
        aria-label="Uygunluk matrisi"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--accent)', width: 12 }}>{acik ? '▾' : '▸'}</span>
        <strong style={{ fontSize: 13 }}>🧭 KİMLERİ KOYABİLİRİM</strong>
        {acik && data && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
            {o.eligible}/{o.total} uygun · {o.blocked} engelli
          </span>
        )}
      </button>

      {acik && (
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <select
              className="form-select" aria-label="Matris günü" style={{ width: 'auto', fontSize: 11 }}
              value={gun} onChange={e => setTarih(e.target.value)}
            >
              {weekDays.map(g => <option key={g} value={g}>{shortDay(g)} {g.slice(8, 10)}</option>)}
            </select>
            <select
              className="form-select" aria-label="Matris vardiyası" style={{ width: 'auto', fontSize: 11 }}
              value={vardiya} onChange={e => setVardiya(e.target.value)}
            >
              <option value="">Vardiya farketmez</option>
              {shiftDefs.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <select
              className="form-select" aria-label="Matris departmanı" style={{ width: 'auto', fontSize: 11 }}
              value={departman} onChange={e => setDepartman(e.target.value)}
            >
              <option value="">Tüm departmanlar</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={yalnizUygun} onChange={e => setYalnizUygun(e.target.checked)} />
              Yalnız uygunlar
            </label>
          </div>

          {isPending && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Matris hesaplanıyor…</div>}

          {isError && (
            <div style={{ fontSize: 11, color: 'var(--red)' }}>
              Matris alınamadı — {error?.response?.data?.error || error?.message}{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Tekrar dene</button>
            </div>
          )}

          {data && (
            <>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>
                {o.eligible} uygun · {o.with_warnings} uyarılı · {o.blocked} engelli
                {o.not_fully_verified > 0 && (
                  // Ölçülemeyen kontrol gizlenirse liste olduğundan güvenilir görünür.
                  <span style={{ color: 'var(--amber)' }}> · {o.not_fully_verified} kişide ölçülemeyen kontrol var</span>
                )}
              </div>

              {/* Kırpma sessiz kalırsa liste tam sanılır. */}
              {data.truncated_at && (
                <div style={{ fontSize: 10, color: 'var(--amber)', marginBottom: 4 }}>
                  Liste ilk {data.truncated_at} kişiyle sınırlandı — departman seçerek daraltın.
                </div>
              )}

              {data.items.length === 0
                ? <div style={{ fontSize: 11, color: 'var(--text3)' }}>Bu filtrede kimse yok.</div>
                : (
                  <div style={{ display: 'grid', gap: 2, maxHeight: 320, overflowY: 'auto' }}>
                    {data.items.map(s => {
                      const d = durum(s)
                      const sorunlar = (s.checks || []).filter(c => c.status !== 'ok')
                      return (
                        <div
                          key={s.staff_id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                            padding: '3px 0', borderTop: '1px dashed var(--border)', fontSize: 11,
                          }}
                          title={sorunlar.map(c => `${c.label}: ${c.detail}`).join('\n') || 'Tüm kontroller temiz'}
                        >
                          <span aria-hidden="true" style={{ color: RENK[d.key], fontFamily: 'var(--mono)', width: 12 }}>
                            {ISARET[d.key]}
                          </span>
                          <strong style={{ minWidth: 130 }}>{s.full_name}</strong>
                          <span style={{ color: 'var(--text3)', flex: '1 1 120px' }}>
                            {[s.dept_name, s.role_name].filter(Boolean).join(' · ') || '—'}
                          </span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: RENK[d.key] }}>{d.metin}</span>
                          {sorunlar.length > 0 && (
                            <span style={{ fontSize: 10, color: 'var(--text2)', flexBasis: '100%' }}>
                              {sorunlar.map(c => c.detail).join(' · ')}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
