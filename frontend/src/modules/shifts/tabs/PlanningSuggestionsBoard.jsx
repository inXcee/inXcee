import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { shortDay } from '../shared.jsx'

// Faz 12 — Akıllı planlama ve senaryolar.
//
// Boş noktaya kimi koyacağına amir hafızasıyla karar veriyordu; yük hep aynı
// birkaç kişiye yığılıyordu. Burada açık başına puanlı aday listesi ve üç
// stratejinin yan yana karşılaştırması var.
//
// Öneri KARAR DEĞİLDİR: her adayın puanı gerekçe kalemleriyle gösterilir,
// atamayı insan yapar. "Aday yok" ile "adaylar engelli" ayrı yazılır.

const STRATEJI_ADI = {
  coverage: 'Kapsama önceliği',
  fairness: 'Adalet önceliği',
  cost: 'Maliyet önceliği',
}

export default function PlanningSuggestionsBoard({ weekDays = [], departments = [] }) {
  const [acik, setAcik] = useState(false)
  const [tarih, setTarih] = useState(() => weekDays[0] || '')
  const [strateji, setStrateji] = useState('coverage')
  const [departman, setDepartman] = useState('')
  const [senaryoAcik, setSenaryoAcik] = useState(false)

  const gun = tarih || weekDays[0]
  const params = { date: gun, ...(departman ? { dept_id: departman } : {}) }

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['planning-suggestions', gun, strateji, departman],
    queryFn: () => api.get('/shifts/planning-suggestions', { params: { ...params, strategy: strateji } }).then(r => r.data),
    enabled: acik && !!gun,
  })

  const senaryolar = useQuery({
    queryKey: ['planning-scenarios', gun, departman],
    queryFn: () => api.get('/shifts/planning-scenarios', { params }).then(r => r.data),
    enabled: senaryoAcik && !!gun,
  })

  const o = data?.summary || {}

  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setAcik(a => !a)}
        aria-expanded={acik}
        aria-label="Planlama önerileri"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--accent)', width: 12 }}>{acik ? '▾' : '▸'}</span>
        <strong style={{ fontSize: 13 }}>🧩 PLANLAMA ÖNERİSİ</strong>
        {acik && data && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: o.missing_total ? 'var(--amber)' : 'var(--green)' }}>
            {o.missing_total ? `${o.missing_total} kişi eksik · ${o.gaps} nokta` : 'açık yok'}
          </span>
        )}
      </button>

      {acik && (
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <select
              className="form-select" aria-label="Öneri günü" style={{ width: 'auto', fontSize: 11 }}
              value={gun} onChange={e => setTarih(e.target.value)}
            >
              {weekDays.map(g => <option key={g} value={g}>{shortDay(g)} {g.slice(8, 10)}</option>)}
            </select>
            <select
              className="form-select" aria-label="Öneri stratejisi" style={{ width: 'auto', fontSize: 11 }}
              value={strateji} onChange={e => setStrateji(e.target.value)}
            >
              {Object.entries(STRATEJI_ADI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select
              className="form-select" aria-label="Öneri departmanı" style={{ width: 'auto', fontSize: 11 }}
              value={departman} onChange={e => setDepartman(e.target.value)}
            >
              <option value="">Tüm departmanlar</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => setSenaryoAcik(a => !a)} aria-expanded={senaryoAcik}>
              {senaryoAcik ? '▴' : '▾'} Senaryoları karşılaştır
            </button>
          </div>

          {isPending && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Öneri hesaplanıyor…</div>}

          {isError && (
            <div style={{ fontSize: 11, color: 'var(--red)' }}>
              Öneri alınamadı — {error?.response?.data?.error || error?.message}{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Tekrar dene</button>
            </div>
          )}

          {senaryoAcik && (
            <div style={{ marginBottom: 10 }}>
              {senaryolar.isPending && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Senaryolar hesaplanıyor…</div>}
              {senaryolar.isError && (
                <div style={{ fontSize: 11, color: 'var(--red)' }}>
                  Senaryolar alınamadı — {senaryolar.error?.response?.data?.error || senaryolar.error?.message}
                </div>
              )}
              {senaryolar.data && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '6px 8px' }}>
                  {senaryolar.data.scenarios.map(s => (
                    <div key={s.strategy} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, padding: '2px 0' }}>
                      <strong style={{ minWidth: 130 }}>{STRATEJI_ADI[s.strategy] || s.strategy}</strong>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                        {s.fills} doldurur · {s.remaining} açık kalır · {s.distinct_people} kişi
                        {s.stacked > 0 && ` · ${s.stacked} yığılma`}
                      </span>
                      {s.avg_recent_shifts != null && (
                        <span style={{ color: 'var(--text3)' }}>son 14 gün ort. {s.avg_recent_shifts}</span>
                      )}
                      {/* Ölçülemeyen kontrolü olan seçim sessizce "temiz" görünmemeli. */}
                      {s.unverified > 0 && (
                        <span style={{ color: 'var(--amber)' }}>{s.unverified} kişide ölçülemeyen kontrol</span>
                      )}
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                    En çok dolduran: {STRATEJI_ADI[senaryolar.data.recommendation.most_filled]}
                    {senaryolar.data.recommendation.most_balanced && (
                      <> · En dengeli: {STRATEJI_ADI[senaryolar.data.recommendation.most_balanced]}</>
                    )}
                    <div>{senaryolar.data.recommendation.note}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {data && (
            <>
              {/* Okunamayan kaynak gizlenirse "açık yok" sonucu yanlış olur. */}
              {data.unavailable?.length > 0 && (
                <div style={{
                  fontSize: 10, color: 'var(--text2)', background: 'rgba(245,158,11,.10)',
                  border: '1px solid rgba(245,158,11,.35)', borderRadius: 8, padding: '5px 7px', marginBottom: 6,
                }}>
                  ⚠ {data.unavailable.length} kaynak okunamadı, öneri eksik olabilir:{' '}
                  {data.unavailable.map(u => u.source).join(', ')}
                </div>
              )}

              {data.gaps.length === 0
                ? <div style={{ fontSize: 11, color: 'var(--green)' }}>Bu gün için kapsama açığı yok.</div>
                : data.gaps.map(g => (
                  <div key={g.rule_id} style={{ borderTop: '1px dashed var(--border)', padding: '6px 0' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 11 }}>
                      <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)' }}>−{g.missing}</span>
                      <strong>{g.rule_name}</strong>
                      <span style={{ color: 'var(--text3)', flex: '1 1 120px' }}>
                        {[g.shift_name, g.location].filter(Boolean).join(' · ')}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{g.assigned}/{g.required}</span>
                    </div>

                    {g.candidates.length === 0
                      ? (
                        // "Aday yok" ile "adaylar engelli" farklı şeylerdir.
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {g.blocked_count > 0
                            ? `Uygun aday yok — havuzdaki ${g.blocked_count} kişinin hepsi engelli.`
                            : 'Bu nokta için aday havuzu boş.'}
                        </div>
                      )
                      : (
                        <div style={{ display: 'grid', gap: 2, marginTop: 3 }}>
                          {g.candidates.map(c => (
                            <div key={c.staff_id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
                              <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', width: 28 }}>{c.score}</span>
                              <strong style={{ minWidth: 120 }}>{c.full_name}</strong>
                              <span style={{ color: 'var(--text3)', flex: '1 1 140px' }}>
                                {c.reasons.length ? c.reasons.map(r => r.aciklama).join(' · ') : 'ek etken yok'}
                              </span>
                              {!c.fully_verified && (
                                <span style={{ fontSize: 10, color: 'var(--amber)' }}>ölçülemeyen kontrol</span>
                              )}
                            </div>
                          ))}
                          {g.blocked_count > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                              {g.blocked_count} kişi engelli olduğu için listede yok
                            </div>
                          )}
                          {/* Havuz kırpıldıysa liste tam sanılmamalı. */}
                          {g.pool_truncated && (
                            <div style={{ fontSize: 10, color: 'var(--amber)' }}>
                              Aday havuzu ilk {g.pool_truncated} kişiyle sınırlandı
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
