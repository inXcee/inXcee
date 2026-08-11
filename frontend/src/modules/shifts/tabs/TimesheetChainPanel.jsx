import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'

// Faz 7 — Puantaj açıklanabilirlik zinciri.
//
// Hücrede "çalıştı / izinli / devamsız" yazıyor ama NEDEN öyle yazdığı hiçbir
// yerde görünmüyordu. İtiraz geldiğinde (bordroda eksik gün, mesai yok) kimse
// zinciri geriye izleyemiyordu.
//
// Panel kapalı başlar ve isteği ancak açılınca atar: hücre düzenleyici her sağ
// tıkta açılıyor, her açılışta bir istek daha atmak gereksiz yük olurdu.

const RENK = {
  ok: 'var(--green)',
  missing: 'var(--red)',
  unavailable: 'var(--text3)',   // ölçülemeyen ile eksik aynı görünmemeli
}

const ISARET = { ok: '●', missing: '✕', unavailable: '?' }

export default function TimesheetChainPanel({ staffId, date }) {
  const [acik, setAcik] = useState(false)

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['timesheet-chain', staffId, date],
    queryFn: () => api.get('/shifts/timesheet-chain', { params: { staff_id: staffId, date } }).then(r => r.data),
    enabled: acik && !!staffId && !!date,
  })

  const kopuk = data?.gaps?.length ?? 0

  return (
    <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setAcik(a => !a)}
        aria-expanded={acik}
        style={{ fontSize: 10, letterSpacing: 0.5 }}
      >
        {acik ? '▴' : '▾'} Bu gün neden böyle görünüyor?
      </button>

      {acik && (
        <div style={{ marginTop: 8 }}>
          {isPending && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Zincir çıkarılıyor…</div>}

          {isError && (
            <div style={{ fontSize: 11, color: 'var(--red)' }}>
              Zincir alınamadı — {error?.response?.data?.error || error?.message}{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => refetch()} disabled={isFetching}>Tekrar dene</button>
            </div>
          )}

          {data && (
            <>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.5, marginBottom: 6,
                color: data.explainable ? 'var(--green)' : 'var(--red)',
              }}>
                {data.explainable
                  ? 'Zincir tam — bu günün bordroya nasıl yansıdığı açıklanabilir'
                  : `${kopuk} halka kopuk — bu gün tam açıklanamıyor`}
              </div>

              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
                {(data.links || []).map((h, i) => (
                  <li
                    key={h.key}
                    style={{
                      display: 'grid', gridTemplateColumns: '14px 1fr', gap: 8,
                      alignItems: 'start', padding: '5px 0',
                      borderTop: i === 0 ? 'none' : '1px dashed var(--border)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ color: RENK[h.status] || 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11, lineHeight: '15px' }}
                    >
                      {ISARET[h.status] || '·'}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 650 }}>
                        {h.label}
                        {h.status === 'unavailable' && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginLeft: 6 }}>
                            ölçülemiyor
                          </span>
                        )}
                      </span>
                      {/* Kopuk halkanın gerekçesi gizlenirse zinciri göstermenin anlamı kalmaz. */}
                      <span style={{ display: 'block', fontSize: 10, color: h.status === 'ok' ? 'var(--text3)' : 'var(--text2)' }}>
                        {h.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  )
}
