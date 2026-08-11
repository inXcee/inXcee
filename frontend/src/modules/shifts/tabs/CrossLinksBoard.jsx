import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { shortDay } from '../shared.jsx'

// Faz 14 — Modüller arası bağlar.
//
// Vardiya, servis ve yemekhane aynı insanları konuşuyor ama birbirine hiç
// bakmıyordu: çizelgede olan kişi servise yazılmamış (sabah gelemiyor), servise
// yazılan kişi o gün çalışmıyor (boş koltuk), yemek sayısı çizelgeden bağımsız.
//
// Ölçülemeyen bağ SIFIR göstermez, gerekçesini yazar — "0 eksik" ile "servis o
// gün hiç kullanılmamış" bambaşka şeylerdir.

function Kutu({ baslik, bag, children }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '7px 9px', minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text3)', marginBottom: 3 }}>
        {baslik}
      </div>
      {bag?.measurable
        ? children
        : <div style={{ fontSize: 10, color: 'var(--amber)' }}>{bag?.reason || 'Ölçülemedi'}</div>}
    </div>
  )
}

function Liste({ baslik, liste, renk }) {
  const kayitlar = liste?.items || []
  if (!kayitlar.length) return null
  return (
    <div style={{ marginTop: 3 }}>
      <div style={{ fontSize: 10, color: renk || 'var(--text2)' }}>{baslik} ({kayitlar.length})</div>
      <div style={{ fontSize: 10, color: 'var(--text3)' }}>
        {kayitlar.map(k => k.full_name || `#${k.staff_id}`).join(', ')}
      </div>
      {/* Kırpma sessiz kalırsa liste tam sanılır. */}
      {liste.truncated > 0 && <div style={{ fontSize: 9, color: 'var(--text3)' }}>+{liste.truncated} kişi daha</div>}
    </div>
  )
}

export default function CrossLinksBoard({ weekDays = [] }) {
  const [acik, setAcik] = useState(false)
  const [tarih, setTarih] = useState(() => {
    const bugun = new Date().toLocaleDateString('sv-SE')
    return weekDays.includes(bugun) ? bugun : (weekDays[0] || bugun)
  })

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['cross-links', tarih],
    queryFn: () => api.get('/shifts/cross-links', { params: { date: tarih } }).then(r => r.data),
    enabled: acik && !!tarih,
  })

  const l = data?.links || {}

  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setAcik(a => !a)}
        aria-expanded={acik}
        aria-label="Modüller arası bağlar"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--accent)', width: 12 }}>{acik ? '▾' : '▸'}</span>
        <strong style={{ fontSize: 13 }}>🔗 SERVİS · YEMEK · DEVAM BAĞLARI</strong>
        {acik && data && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: data.unmeasurable.length ? 'var(--amber)' : 'var(--green)' }}>
            {data.unmeasurable.length ? `${data.unmeasurable.length} bağ ölçülemiyor` : 'tüm bağlar ölçülebiliyor'}
          </span>
        )}
      </button>

      {acik && (
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {weekDays.map(g => (
              <button
                key={g}
                className={`btn btn-xs ${g === tarih ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTarih(g)}
                aria-label={`${g} bağları`}
              >
                {shortDay(g)} {g.slice(8, 10)}
              </button>
            ))}
          </div>

          {isPending && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Bağlar çıkarılıyor…</div>}

          {isError && (
            <div style={{ fontSize: 11, color: 'var(--red)' }}>
              Bağlar alınamadı — {error?.response?.data?.error || error?.message}{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Tekrar dene</button>
            </div>
          )}

          {data && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 6 }}>
              <Kutu baslik="SERVİS" bag={l.transport}>
                <div style={{ fontSize: 11 }}>
                  {l.transport?.working} çalışan · {l.transport?.assigned} servis ataması
                </div>
                <Liste baslik="Çizelgede var, servise yazılmamış" liste={l.transport?.working_without_transport} renk="var(--red)" />
                <Liste baslik="Serviste var, o gün çalışmıyor" liste={l.transport?.transport_without_shift} renk="var(--amber)" />
              </Kutu>

              <Kutu baslik="YEMEK" bag={l.meals}>
                <div style={{ fontSize: 11 }}>{l.meals?.working} çalışan</div>
                {(l.meals?.by_type || []).map(t => (
                  <div key={t.type} style={{ fontSize: 10, color: 'var(--text2)' }}>
                    {t.type}: {t.attending} katılıyor · fark {t.gap}
                  </div>
                ))}
                <Liste baslik="Çalışıyor, yemek seçimi yok" liste={l.meals?.working_without_selection} renk="var(--amber)" />
              </Kutu>

              <Kutu baslik="DEVAM KANITI" bag={l.attendance}>
                <div style={{ fontSize: 11 }}>
                  {l.attendance?.with_evidence}/{l.attendance?.working} kişide giriş kaydı
                </div>
              </Kutu>

              <Kutu baslik="BİRLEŞİK RİSK" bag={l.combined_risk}>
                <div style={{ fontSize: 11 }}>
                  {l.combined_risk?.not_boarded} servise binmedi · {l.combined_risk?.absent} devamsız
                </div>
                <Liste baslik="Hem binmedi hem gelmedi" liste={l.combined_risk?.both} renk="var(--red)" />
              </Kutu>

              <Kutu baslik="AYRILAN, VARDİYASI DURUYOR" bag={l.exited_future}>
                {l.exited_future?.count === 0
                  ? <div style={{ fontSize: 11, color: 'var(--green)' }}>Ayrılmış kimsenin gelecek vardiyası yok.</div>
                  : (
                    <>
                      <div style={{ fontSize: 11, color: 'var(--red)' }}>{l.exited_future?.count} kişi</div>
                      {(l.exited_future?.people?.items || []).map(k => (
                        <div key={k.staff_id} style={{ fontSize: 10, color: 'var(--text2)' }}>
                          {k.full_name} · çıkış {k.exit_date} · ilk vardiya {k.first_shift} ({k.days} gün)
                        </div>
                      ))}
                      {l.exited_future?.people?.truncated > 0 && (
                        <div style={{ fontSize: 9, color: 'var(--text3)' }}>+{l.exited_future.people.truncated} kişi daha</div>
                      )}
                    </>
                  )}
              </Kutu>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
