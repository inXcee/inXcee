import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../../shared/api/client.js'

// Vardiya Hazırlık göstergesi — sayfanın en üstünde.
//
// Neden: ana veriler eksikken çizelge, puantaj ve bordro sessizce yanlış
// çalışıyor. Canlıda 196 aktif personelin 195'inde rol atanmamıştı, 8 vardiya
// tanımının adı `.` `..` gibi noktalamaydı; ekranlar bunu boş liste ya da
// "0 sonuç" olarak gösterip sorunu gizliyordu.
//
// Her satır tıklanabilir: sorunu gösterip çözümü başka ekranda aratmak, bugünkü
// dağınıklığın sebebi.

const DURUM = {
  critical: { renk: 'var(--red)', simge: '●', etiket: 'Kritik' },
  warning: { renk: 'var(--accent)', simge: '▲', etiket: 'Uyarı' },
  ok: { renk: 'var(--green)', simge: '✓', etiket: 'Tamam' },
  // "Bakamadım" ile "sorun yok" aynı şey değil — ayrı renk, ayrı sözcük.
  unknown: { renk: 'var(--text3)', simge: '?', etiket: 'Ölçülemedi' },
}
const SIRA = { critical: 0, unknown: 1, warning: 2, ok: 3 }

export default function ReadinessBoard() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['shifts-readiness'],
    queryFn: () => api.get('/shifts/readiness').then(r => r.data),
    staleTime: 60000,
  })
  // Kritik ya da ölçülemeyen varken kendiliğinden açılır; her şey yolundaysa
  // tek satır kalır ve ekranı doldurmaz.
  const [acikSecim, setAcikSecim] = useState(null)

  if (isPending) return null
  if (isError) {
    return (
      <div className="panel" style={{ marginBottom: 12, borderLeft: '3px solid var(--red)', padding: '10px 14px', fontSize: 12 }}>
        Hazırlık durumu alınamadı — {error?.response?.data?.error || error?.message || 'bilinmeyen hata'}{' '}
        <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Tekrar dene</button>
      </div>
    )
  }

  const ozet = data?.summary || {}
  const maddeler = [...(data?.items || [])].sort((a, b) => (SIRA[a.status] ?? 9) - (SIRA[b.status] ?? 9))
  const dikkat = (ozet.critical || 0) + (ozet.unknown || 0)
  const acik = acikSecim === null ? dikkat > 0 : acikSecim

  return (
    <div className="panel" style={{
      marginBottom: 12,
      borderLeft: `3px solid ${ozet.ready ? 'var(--green)' : dikkat > 0 ? 'var(--red)' : 'var(--accent)'}`,
    }}>
      <button
        type="button"
        onClick={() => setAcikSecim(!acik)}
        aria-expanded={acik}
        aria-label="Hazırlık durumu"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--accent)', width: 12 }}>{acik ? '▾' : '▸'}</span>
        <strong style={{ fontSize: 13 }}>HAZIRLIK DURUMU</strong>
        <span style={{ display: 'flex', gap: 10, marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11 }}>
          {ozet.ready
            ? <span style={{ color: 'var(--green)' }}>sistem hazır</span>
            : <>
                {!!ozet.critical && <span style={{ color: 'var(--red)' }}>{ozet.critical} kritik</span>}
                {!!ozet.warning && <span style={{ color: 'var(--accent)' }}>{ozet.warning} uyarı</span>}
                {/* Ölçülemeyen sayısı gizlenirse "her şey yolunda" sanılır. */}
                {!!ozet.unknown && <span style={{ color: 'var(--text3)' }}>{ozet.unknown} ölçülemedi</span>}
              </>}
          <span style={{ color: 'var(--text3)' }}>{ozet.ok}/{ozet.total} tamam</span>
        </span>
      </button>

      {acik && (
        <div style={{ padding: '0 14px 12px' }}>
          {maddeler.map(madde => {
            const stil = DURUM[madde.status] || DURUM.unknown
            return (
              <div key={madde.key} style={{
                display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
                padding: '7px 0', borderTop: '1px dashed var(--border)',
              }}>
                <span style={{ color: stil.renk, width: 12, fontSize: 12 }} title={stil.etiket} aria-hidden="true">{stil.simge}</span>
                <strong style={{ fontSize: 12, minWidth: 150 }}>{madde.label}</strong>
                <span style={{ fontSize: 11, color: 'var(--text2)', flex: '1 1 240px' }}>{madde.detail}</span>
                {madde.count !== null && madde.count !== undefined && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: stil.renk }}>
                    {madde.count}{madde.total ? `/${madde.total}` : ''}
                  </span>
                )}
                {/* Düzeltme bağlantısı her satırda: sorunu gösterip çözümü
                    aratmamak bu katmanın asıl amacı. */}
                {madde.status !== 'ok' && madde.action?.route && (
                  <Link to={madde.action.route} className="btn btn-ghost btn-xs">{madde.action.label} →</Link>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
