import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../../shared/api/client.js'

// Faz 3 — Aksiyon Merkezi.
//
// Aynı sorunlar farklı ekranlara dağılmıştı: onay bekleyen izin puantajda, açık
// vardiya çizelgede, süresi dolan belge personel dosyasında. Kimse hepsini
// birden görmediği için en acilinin hangisi olduğu da bilinmiyordu.
//
// Geçmiş / bugün / gelecek ayrı sayılır: gelecek tarihli plan eksiği "kritik"
// değildir. "1000 kritik eksik" gibi rakamlar tam da bu ayrım yapılmadığı için
// çıkıyor.

const ONEM = {
  critical: { renk: 'var(--red)', simge: '●', etiket: 'Kritik' },
  warning: { renk: 'var(--accent)', simge: '▲', etiket: 'Uyarı' },
  info: { renk: 'var(--text3)', simge: '·', etiket: 'Bilgi' },
}
const SUZGECLER = [
  ['all', 'Hepsi'],
  ['overdue', 'Gecikmiş'],
  ['today', 'Bugün'],
  ['future', 'Gelecek'],
]
const LISTE_SINIRI = 25

export default function ActionCenterBoard() {
  const [acik, setAcik] = useState(true)
  const [suzgec, setSuzgec] = useState('all')

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['shifts-action-center'],
    queryFn: () => api.get('/shifts/action-center', { params: { from: '2020-01-01', to: '2030-01-01' } }).then(r => r.data),
    staleTime: 60000,
  })

  if (isPending) return null
  if (isError) {
    return (
      <div className="panel" style={{ marginBottom: 12, padding: '10px 14px', fontSize: 12, borderLeft: '3px solid var(--red)' }}>
        Aksiyon listesi alınamadı — {error?.response?.data?.error || error?.message}{' '}
        <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Tekrar dene</button>
      </div>
    )
  }

  const ozet = data.summary || {}
  const tumu = data.items || []
  const gosterilecek = suzgec === 'all' ? tumu : tumu.filter(i => i.timeframe === suzgec)
  const kirpilan = Math.max(0, gosterilecek.length - LISTE_SINIRI)

  return (
    <div className="panel" style={{
      marginBottom: 12,
      borderLeft: `3px solid ${ozet.critical ? 'var(--red)' : ozet.warning ? 'var(--accent)' : 'var(--green)'}`,
    }}>
      <button
        type="button"
        onClick={() => setAcik(a => !a)}
        aria-expanded={acik}
        aria-label="Aksiyon merkezi"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--accent)', width: 12 }}>{acik ? '▾' : '▸'}</span>
        <strong style={{ fontSize: 13 }}>AKSİYON MERKEZİ</strong>
        <span style={{ display: 'flex', gap: 10, marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11 }}>
          {ozet.total === 0
            ? <span style={{ color: 'var(--green)' }}>bekleyen iş yok</span>
            : <>
                {!!ozet.overdue && <span style={{ color: 'var(--red)' }}>{ozet.overdue} gecikmiş</span>}
                {!!ozet.today && <span style={{ color: 'var(--accent)' }}>{ozet.today} bugün</span>}
                {/* Gelecek ayrı yazılır ki kritik sayısını şişirmesin. */}
                {!!ozet.future && <span style={{ color: 'var(--text3)' }}>{ozet.future} gelecek</span>}
              </>}
        </span>
      </button>

      {acik && (
        <div style={{ padding: '0 14px 12px' }}>
          {/* Ölçülemeyen kaynak gizlenirse boş liste "sorun yok" sanılır. */}
          {data.unavailable?.length > 0 && (
            <div style={{
              fontSize: 10, color: 'var(--text2)', background: 'rgba(245,158,11,.10)',
              border: '1px solid rgba(245,158,11,.35)', borderRadius: 8, padding: '6px 8px', marginBottom: 8,
            }}>
              ⚠ {data.unavailable.length} kaynak okunamadı, bu liste eksik olabilir:{' '}
              {data.unavailable.map(u => u.source).join(', ')}
            </div>
          )}

          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
            {SUZGECLER.map(([key, label]) => (
              <button
                key={key}
                className={`btn btn-xs ${suzgec === key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSuzgec(key)}
              >
                {label}{key !== 'all' && ozet[key] ? ` ${ozet[key]}` : ''}
              </button>
            ))}
          </div>

          {gosterilecek.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text3)', padding: '8px 0' }}>
              {suzgec === 'all' ? 'Bekleyen iş yok.' : 'Bu dilimde bekleyen iş yok.'}
            </div>
          )}

          {gosterilecek.slice(0, LISTE_SINIRI).map(kayit => {
            const stil = ONEM[kayit.severity] || ONEM.info
            return (
              <div key={kayit.key} style={{
                display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
                padding: '6px 0', borderTop: '1px dashed var(--border)',
              }}>
                <span style={{ color: stil.renk, width: 10, fontSize: 11 }} title={stil.etiket} aria-hidden="true">{stil.simge}</span>
                <strong style={{ fontSize: 11.5, minWidth: 170 }}>{kayit.title}</strong>
                <span style={{ fontSize: 11 }}>{kayit.staff_name}</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', flex: '1 1 200px' }}>{kayit.detail}</span>
                <Link to={kayit.action.route} className="btn btn-ghost btn-xs">{kayit.action.label} →</Link>
              </div>
            )
          })}

          {/* Kırpma sessiz kalırsa liste tam sanılır. */}
          {kirpilan > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text3)', paddingTop: 8 }}>
              … +{kirpilan} kayıt daha (süzgeçle daraltın)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
