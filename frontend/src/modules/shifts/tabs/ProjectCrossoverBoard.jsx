import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../../shared/api/client.js'
import { formatDate } from '../shared.jsx'
import {
  crossoverState, summarizeCrossover, crossoverDirections, CROSSOVER_STATE,
} from '../logic/projectCrossover.js'

// "Kadrosu FPU'da ama Kamp'ta çalışanlar" panosu.
//
// Boş liste tek başına cevap değil: çalışma noktaları projeye bağlanmadıysa
// liste zaten boş gelir. Panel bu iki durumu AYRI gösterir, yoksa eksik kurulum
// "çapraz çalışan yok" diye okunur.
export default function ProjectCrossoverBoard({ from, to, onPersonClick }) {
  const [acik, setAcik] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['project-mismatch', from, to],
    queryFn: () => api.get('/shifts/project-mismatch', { params: { from, to } }).then(r => r.data),
    enabled: !!from && !!to && acik,
    staleTime: 60000,
  })

  const durum = crossoverState(data)
  const kisiler = useMemo(() => summarizeCrossover(data?.rows), [data])
  const yonler = useMemo(() => crossoverDirections(data?.rows), [data])
  const eslenmeyen = data?.setup?.unmapped_locations || 0

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, marginBottom: 10, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setAcik(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'transparent', border: 'none',
          cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
        }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 12, letterSpacing: 1 }}>
          ⇄ ÇAPRAZ ÇALIŞMA
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
          Kadrosu bir projede, fiilen başka projede çalışanlar
        </span>
        <span style={{ flex: 1 }} />
        {acik && durum === CROSSOVER_STATE.HAS_ROWS && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 8px', borderRadius: 999,
            background: 'rgba(245,158,11,.14)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,.4)',
          }}>
            {kisiler.length} kişi
          </span>
        )}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{acik ? '▾' : '▸'}</span>
      </button>

      {acik && (
        <div style={{ padding: '0 14px 14px' }}>
          {isLoading && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Yükleniyor…</div>
          )}

          {!isLoading && durum === CROSSOVER_STATE.UNCONFIGURED && (
            <div style={{
              padding: '11px 13px', borderRadius: 10, fontSize: 12,
              background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.35)',
            }}>
              <strong>Bu görünüm henüz kurulmadı.</strong> {eslenmeyen} çalışma noktası bir projeye
              bağlı değil, bu yüzden çapraz çalışma hesaplanamıyor — liste boş görünmesi
              “çapraz çalışan yok” anlamına <em>gelmez</em>.
              {!!data?.setup?.unmapped_names?.length && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                  Bağlanmayı bekleyen: {data.setup.unmapped_names.join(' · ')}
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <Link className="btn btn-sm btn-primary" style={{ fontSize: 11 }} to="/shifts?tab=settings">
                  Çalışma noktalarını projeye bağla
                </Link>
              </div>
            </div>
          )}

          {!isLoading && durum === CROSSOVER_STATE.EMPTY && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', padding: '8px 0' }}>
              Bu aralıkta kimse kendi kadrosunun dışında çalışmamış.
            </div>
          )}

          {!isLoading && durum === CROSSOVER_STATE.HAS_ROWS && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {yonler.map(y => (
                  <div key={y.key} style={{
                    padding: '7px 11px', borderRadius: 9,
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{y.from} → {y.to}</div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 14, marginTop: 2 }}>
                      {y.people} kişi <span style={{ fontSize: 10, color: 'var(--text3)' }}>· {y.days} gün</span>
                    </div>
                  </div>
                ))}
              </div>

              {eslenmeyen > 0 && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', marginBottom: 8 }}>
                  ⚠ {eslenmeyen} nokta hâlâ projesiz — buradaki liste eksik olabilir.
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th>PERSONEL</th>
                      <th>KADROSU</th>
                      <th>ÇALIŞTIĞI</th>
                      <th style={{ textAlign: 'center' }}>GÜN</th>
                      <th>TARİH ARALIĞI</th>
                      <th>NOKTA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kisiler.map(k => (
                      <tr key={k.staffId}
                        onClick={() => onPersonClick?.(k.staffId)}
                        style={{ cursor: onPersonClick ? 'pointer' : 'default' }}>
                        <td style={{ fontWeight: 600 }}>{k.name}</td>
                        <td>{k.rosterProject}</td>
                        <td style={{ color: 'var(--amber)' }}>{k.workedProject}</td>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{k.days}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>
                          {k.firstDate === k.lastDate
                            ? formatDate(k.firstDate)
                            : `${formatDate(k.firstDate)} – ${formatDate(k.lastDate)}`}
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                          {k.locations.join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
