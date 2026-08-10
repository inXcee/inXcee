import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { formatDate, shortDay } from '../shared.jsx'

// Faz 6 — Günlük Operasyon Merkezi.
//
// Gün detayı paneli "kim hangi vardiyada, nerede" sorusunu zaten cevaplıyor.
// Burada cevaplanmayan üçü var:
//   1) Hangi nokta EKSİK kadroyla çalışıyor (kapsama kuralına göre)
//   2) Biri gelmezse YERİNE kimi çağırabilirim
//   3) Gün içinde ne oldu — devir teslim notu (şimdiye kadar sözlü aktarılıyordu)

const toastOk = m => useToastStore.getState().addToast(m, 'success')
const toastErr = e => useToastStore.getState().addToast(e?.response?.data?.error || e?.message || 'İşlem başarısız', 'error')

export default function DayOperationsBoard({ weekDays = [] }) {
  const queryClient = useQueryClient()
  const [acik, setAcik] = useState(true)
  const [tarih, setTarih] = useState(() => {
    const bugun = new Date().toLocaleDateString('sv-SE')
    return weekDays.includes(bugun) ? bugun : (weekDays[0] || bugun)
  })
  const [not, setNot] = useState('')
  const [adayAcik, setAdayAcik] = useState(false)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['day-operations', tarih],
    queryFn: () => api.get('/shifts/day-operations', { params: { date: tarih } }).then(r => r.data),
    enabled: !!tarih && acik,
  })

  const adaylar = useQuery({
    queryKey: ['day-operations-replacements', tarih],
    queryFn: () => api.get('/shifts/day-operations/replacements', { params: { date: tarih, limit: 20 } }).then(r => r.data),
    enabled: adayAcik && !!tarih,
  })

  const notMut = useMutation({
    mutationFn: () => api.post('/shifts/day-operations/handover', { date: tarih, note: not }),
    onSuccess: () => {
      setNot('')
      queryClient.invalidateQueries({ queryKey: ['day-operations', tarih] })
      toastOk('Devir teslim notu eklendi')
    },
    onError: toastErr,
  })

  if (isPending && acik) return null

  const ozet = data?.summary || {}
  const acikKadro = data?.coverage_gaps || []
  const eksikToplam = acikKadro.reduce((t, g) => t + g.missing, 0)

  return (
    <div className="panel" style={{
      marginBottom: 12,
      borderLeft: `3px solid ${eksikToplam > 0 ? 'var(--red)' : 'var(--green)'}`,
    }}>
      <button
        type="button"
        onClick={() => setAcik(a => !a)}
        aria-expanded={acik}
        aria-label="Günlük operasyon"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--accent)', width: 12 }}>{acik ? '▾' : '▸'}</span>
        <strong style={{ fontSize: 13 }}>🛠 GÜNLÜK OPERASYON</strong>
        {acik && (
          <span style={{ display: 'flex', gap: 10, marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11 }}>
            {eksikToplam > 0
              ? <span style={{ color: 'var(--red)' }}>{eksikToplam} kişi eksik · {acikKadro.length} nokta</span>
              : <span style={{ color: 'var(--green)' }}>kapsama tam</span>}
            <span style={{ color: 'var(--text3)' }}>çalışan {ozet.worked ?? 0} · planlı {ozet.planned ?? 0}</span>
          </span>
        )}
      </button>

      {acik && (
        <div style={{ padding: '0 14px 12px' }}>
          {isError && (
            <div style={{ fontSize: 11, color: 'var(--red)', padding: '6px 0' }}>
              Gün operasyonu alınamadı — {error?.response?.data?.error || error?.message}{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Tekrar dene</button>
            </div>
          )}

          {/* Gün seçici */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            {weekDays.map(g => (
              <button
                key={g}
                className={`btn btn-xs ${g === tarih ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTarih(g)}
                aria-label={`${formatDate(g)} ${shortDay(g)}`}
              >
                {shortDay(g)} {g.slice(8, 10)}
              </button>
            ))}
          </div>

          {/* Ölçülemeyen kaynak gizlenirse boş liste "sorun yok" sanılır. */}
          {data?.unavailable?.length > 0 && (
            <div style={{
              fontSize: 10, color: 'var(--text2)', background: 'rgba(245,158,11,.10)',
              border: '1px solid rgba(245,158,11,.35)', borderRadius: 8, padding: '6px 8px', marginBottom: 8,
            }}>
              ⚠ {data.unavailable.length} kaynak okunamadı, bu özet eksik olabilir:{' '}
              {data.unavailable.map(u => u.source).join(', ')}
            </div>
          )}

          {/* Devam kaydı: "0 devamsız" demek yerine kaynağın yokluğu söylenir. */}
          {data?.attendance && !data.attendance.available && (
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>
              Giriş/çıkış kaydı yok — gelen/geç/gelmeyen ayrımı yapılamıyor ({data.attendance.reason})
            </div>
          )}

          {/* Kapsama açıkları */}
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, color: 'var(--text3)', marginBottom: 4 }}>
            EKSİK KADRO
          </div>
          {acikKadro.length === 0
            ? <div style={{ fontSize: 11, color: 'var(--green)', paddingBottom: 8 }}>Tüm noktalarda kadro tam.</div>
            : acikKadro.map(g => (
              <div key={g.rule_id} style={{
                display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
                padding: '5px 0', borderTop: '1px dashed var(--border)', fontSize: 11,
              }}>
                <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)', minWidth: 44 }}>−{g.missing}</span>
                <strong style={{ minWidth: 150 }}>{g.rule_name}</strong>
                <span style={{ color: 'var(--text3)', flex: '1 1 180px' }}>
                  {[g.location, g.shift_name, g.time].filter(Boolean).join(' · ')}
                </span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{g.assigned}/{g.required}</span>
              </div>
            ))}

          {/* Yerine çağrılabilecekler */}
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdayAcik(a => !a)} aria-expanded={adayAcik}>
              {adayAcik ? '▴' : '▾'} Yerine çağrılabilecekler
            </button>
            {adayAcik && (
              <div style={{ marginTop: 6 }}>
                {adaylar.isPending && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Yükleniyor…</span>}
                {adaylar.isError && (
                  <span style={{ fontSize: 11, color: 'var(--red)' }}>
                    {adaylar.error?.response?.data?.error || 'Aday listesi alınamadı'}
                  </span>
                )}
                {adaylar.data?.items?.length === 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>Bu gün boşta uygun personel yok.</span>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 4 }}>
                  {(adaylar.data?.items || []).map(a => (
                    <div key={a.id} style={{
                      border: '1px solid var(--border)', borderRadius: 7, padding: '4px 7px', minWidth: 0,
                    }}>
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.full_name}
                      </span>
                      <span style={{ display: 'block', fontSize: 9, color: 'var(--text3)' }}>
                        {[a.department_name, a.role_name].filter(Boolean).join(' · ') || '—'}
                        {' · '}son 7 gün {a.son_7_gun_calisma}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Devir teslim */}
          <div style={{ marginTop: 12, borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, color: 'var(--text3)', marginBottom: 4 }}>
              DEVİR TESLİM
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input
                className="form-input"
                aria-label="Devir teslim notu"
                placeholder="Gün içinde ne oldu? (bir sonraki amir okuyacak)"
                value={not}
                onChange={e => setNot(e.target.value)}
                style={{ flex: 1, fontSize: 11 }}
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={!not.trim() || notMut.isPending}
                onClick={() => notMut.mutate()}
              >
                {notMut.isPending ? '…' : 'Ekle'}
              </button>
            </div>
            {(data?.handover || []).length === 0
              ? <div style={{ fontSize: 11, color: 'var(--text3)' }}>Bu gün için not yok.</div>
              : (data.handover || []).map(h => (
                <div key={h.id} style={{ fontSize: 11, padding: '4px 0', borderTop: '1px dashed var(--border)' }}>
                  <span>{h.note}</span>
                  <span style={{ display: 'block', fontSize: 9, color: 'var(--text3)' }}>
                    {[h.author_name, h.shift_name, h.created_at?.slice(0, 16)].filter(Boolean).join(' · ')}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
