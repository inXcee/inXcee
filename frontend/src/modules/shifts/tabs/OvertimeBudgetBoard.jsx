import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { toastErr, toastOk } from '../shared.jsx'

// Faz 9 — Mesai zinciri ve bütçe panosu.
//
// Zincir: ihtiyaç → ön onay → fiilî çalışma → doğrulama → puantaj. Canlıda iki
// ucu kopuktu ve kopukluk hiçbir ekranda görünmüyordu. Bütçe tarafında onay bir
// tavana karşı verilmiyordu; ay sonunda toplam görülüyor, iş işten geçmiş
// oluyordu.
//
// Tavan TANIMSIZSA "0 tavan" gösterilmez — tanımsız olduğu yazılır. Aksi halde
// hiç tavan koymamış bir departman sürekli "aşıldı" görünürdü.

const KOPUK = [
  { key: 'record_no_request', baslik: 'ÖN ONAYI YOK', satir: k => `${k.work_date} · ${k.full_name} · ${k.hours} saat` },
  { key: 'approved_no_record', baslik: 'FİİLÎ KAYDI GİRİLMEMİŞ', satir: k => `${k.work_date} · ${k.full_name} · onaylı ${k.requested_hours} saat` },
  { key: 'hours_mismatch', baslik: 'SAAT UYUŞMUYOR', satir: k => `${k.work_date} · ${k.full_name} · onaylı ${k.approved_hours} → fiilî ${k.actual_hours} (${k.diff > 0 ? '+' : ''}${k.diff})` },
  { key: 'record_no_approver', baslik: 'ONAYLAYAN YAZMIYOR', satir: k => `${k.work_date} · ${k.full_name} · ${k.hours} saat` },
]

const Kutu = ({ etiket, deger, alt, renk }) => (
  <div style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '6px 9px', minWidth: 0 }}>
    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.6, color: 'var(--text3)' }}>{etiket}</div>
    <div style={{ fontFamily: 'var(--mono)', fontSize: 15, color: renk || 'var(--text)' }}>{deger}</div>
    {alt && <div style={{ fontSize: 9, color: 'var(--text3)' }}>{alt}</div>}
  </div>
)

export default function OvertimeBudgetBoard({ period, deptId = null, projectId = null, isManager = false }) {
  const qc = useQueryClient()
  const [acik, setAcik] = useState(true)
  const [tavanAcik, setTavanAcik] = useState(false)
  const [form, setForm] = useState({ monthly_hours: '', per_person_monthly_hours: '' })

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['overtime-overview', period, deptId, projectId],
    queryFn: () => api.get('/shifts/overtime-overview', {
      params: { period, ...(deptId ? { dept_id: deptId } : {}), ...(projectId ? { project_id: projectId } : {}) },
    }).then(r => r.data),
    enabled: !!period && acik,
  })

  const tavanMut = useMutation({
    mutationFn: () => api.put('/shifts/overtime-budgets', {
      scope: deptId ? 'department' : projectId ? 'project' : 'global',
      scope_id: deptId || projectId || null,
      monthly_hours: form.monthly_hours === '' ? null : Number(form.monthly_hours),
      per_person_monthly_hours: form.per_person_monthly_hours === '' ? null : Number(form.per_person_monthly_hours),
    }),
    onSuccess: () => {
      setTavanAcik(false)
      qc.invalidateQueries({ queryKey: ['overtime-overview'] })
      toastOk('Mesai tavanı kaydedildi')
    },
    onError: toastErr,
  })

  const b = data?.budget || {}
  const t = data?.month_end_forecast || {}
  const kopukToplam = KOPUK.reduce((s, k) => s + (data?.chain?.[k.key]?.length || 0), 0)

  return (
    <div className="panel" style={{
      marginBottom: 12,
      borderLeft: `3px solid ${data?.warnings?.length ? 'var(--red)' : 'var(--green)'}`,
    }}>
      <button
        type="button"
        onClick={() => setAcik(a => !a)}
        aria-expanded={acik}
        aria-label="Mesai bütçesi ve zinciri"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--accent)', width: 12 }}>{acik ? '▾' : '▸'}</span>
        <strong style={{ fontSize: 13 }}>⏱ MESAİ BÜTÇESİ VE ZİNCİRİ</strong>
        {acik && data && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: kopukToplam ? 'var(--red)' : 'var(--green)' }}>
            {kopukToplam ? `${kopukToplam} kopuk halka` : 'zincir sağlam'} · {data.totals.hours} saat
          </span>
        )}
      </button>

      {acik && (
        <div style={{ padding: '0 14px 12px' }}>
          {isPending && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Hesaplanıyor…</div>}

          {isError && (
            <div style={{ fontSize: 11, color: 'var(--red)' }}>
              Mesai özeti alınamadı — {error?.response?.data?.error || error?.message}{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Tekrar dene</button>
            </div>
          )}

          {data && (
            <>
              {/* Okunamayan kaynak gizlenirse boş sonuç "mesai yok" sanılır. */}
              {data.unavailable?.length > 0 && (
                <div style={{
                  fontSize: 10, color: 'var(--text2)', background: 'rgba(245,158,11,.10)',
                  border: '1px solid rgba(245,158,11,.35)', borderRadius: 8, padding: '6px 8px', marginBottom: 8,
                }}>
                  ⚠ {data.unavailable.length} kaynak okunamadı, bu özet eksik olabilir:{' '}
                  {data.unavailable.map(u => u.source).join(', ')}
                </div>
              )}

              {data.warnings?.length > 0 && (
                <ul style={{ margin: '0 0 8px', paddingLeft: 16, color: 'var(--red)', fontSize: 11 }}>
                  {data.warnings.map(u => <li key={u}>{u}</li>)}
                </ul>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, marginBottom: 10 }}>
                <Kutu etiket="TOPLAM" deger={`${data.totals.hours} sa`} alt={`${data.totals.people} kişi · ${data.totals.records} kayıt`} />
                {b.known
                  ? <Kutu
                    etiket="AYLIK TAVAN" deger={`${b.used_hours}/${b.limit_hours}`}
                    alt={b.exceeded ? `${Math.abs(b.remaining_hours)} sa aşım` : `${b.remaining_hours} sa kaldı`}
                    renk={b.exceeded ? 'var(--red)' : 'var(--green)'}
                  />
                  : <Kutu etiket="AYLIK TAVAN" deger="—" alt="tanımlı değil" renk="var(--text3)" />}
                {t.known
                  ? <Kutu
                    etiket={t.complete ? 'GERÇEKLEŞEN' : 'AY SONU TAHMİNİ'}
                    deger={`${t.complete ? t.hours : t.projected} sa`}
                    alt={t.complete ? 'ay kapandı' : `${t.elapsed_days}/${t.total_days} gün`}
                  />
                  : <Kutu etiket="AY SONU TAHMİNİ" deger="—" alt={t.reason} renk="var(--text3)" />}
                {data.fairness?.known
                  ? <Kutu
                    etiket="DAĞILIM" deger={`×${data.fairness.max_to_median}`}
                    alt={`en yüksek ${data.fairness.max} · ortanca ${data.fairness.median}`}
                    renk={data.fairness.max_to_median >= 3 ? 'var(--amber)' : 'var(--text)'}
                  />
                  : <Kutu etiket="DAĞILIM" deger="—" alt={data.fairness?.reason} renk="var(--text3)" />}
              </div>

              {isManager && (
                <div style={{ marginBottom: 10 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setTavanAcik(a => !a)} aria-expanded={tavanAcik}>
                    {tavanAcik ? '▴' : '▾'} Tavan belirle{deptId ? ' (bu departman)' : projectId ? ' (bu proje)' : ' (genel)'}
                  </button>
                  {tavanAcik && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        className="form-input" type="number" min="0" step="1" style={{ width: 120, fontSize: 11 }}
                        aria-label="Aylık toplam tavan (saat)" placeholder="Aylık toplam"
                        value={form.monthly_hours}
                        onChange={e => setForm(f => ({ ...f, monthly_hours: e.target.value }))}
                      />
                      <input
                        className="form-input" type="number" min="0" step="1" style={{ width: 120, fontSize: 11 }}
                        aria-label="Kişi başına aylık tavan (saat)" placeholder="Kişi başına"
                        value={form.per_person_monthly_hours}
                        onChange={e => setForm(f => ({ ...f, per_person_monthly_hours: e.target.value }))}
                      />
                      <button className="btn btn-primary btn-sm" disabled={tavanMut.isPending} onClick={() => tavanMut.mutate()}>
                        {tavanMut.isPending ? '…' : 'Kaydet'}
                      </button>
                      <span style={{ fontSize: 9, color: 'var(--text3)' }}>Boş bırakılan alan tavansız kalır</span>
                    </div>
                  )}
                </div>
              )}

              {/* Zincir kopuklukları */}
              {KOPUK.map(({ key, baslik, satir }) => {
                const liste = data.chain?.[key] || []
                if (!liste.length) return null
                return (
                  <div key={key} style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--red)' }}>
                      {baslik} ({liste.length})
                    </div>
                    {liste.slice(0, 8).map((k, i) => (
                      <div key={i} style={{ fontSize: 11, padding: '2px 0' }}>{satir(k)}</div>
                    ))}
                    {liste.length > 8 && <div style={{ fontSize: 10, color: 'var(--text3)' }}>+{liste.length - 8} kayıt daha</div>}
                  </div>
                )
              })}

              {(data.person_limit?.over?.length > 0 || data.yearly_limit?.over?.length > 0) && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--red)' }}>TAVAN AŞANLAR</div>
                  {data.person_limit.over.map(k => (
                    <div key={`a-${k.staff_id}`} style={{ fontSize: 11 }}>{k.full_name} · aylık {k.hours} sa (+{k.over_by})</div>
                  ))}
                  {data.yearly_limit.over.map(k => (
                    <div key={`y-${k.staff_id}`} style={{ fontSize: 11 }}>{k.full_name} · yıllık {k.hours} sa (+{k.over_by})</div>
                  ))}
                </div>
              )}

              {data.top_people?.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text3)' }}>EN ÇOK MESAİ</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 3 }}>
                    {data.top_people.map(k => (
                      <div key={k.staff_id} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.full_name}</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{k.hours} sa</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
